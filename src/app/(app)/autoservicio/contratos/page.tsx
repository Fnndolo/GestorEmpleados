import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { FilePenLine } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { fechaBreve, rangoBreve } from '@/lib/notificaciones/texto'
import { fmtCOP } from '@/lib/moneda'
import { resumenOtrosi, type ValoresOtrosi } from '@/lib/otrosi'
import { MisContratos } from './mis-contratos'

export const metadata = { title: 'Mis contratos · Smart Gadgets RH' }

export default async function MisContratosPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mis contratos" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  const [contratos, laborales] = await Promise.all([
    prisma.contratoOps.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      orderBy: { creadoEn: 'desc' }, // el último creado aparece primero
    }),
    prisma.contrato.findMany({
      where: { colaboradorId: usuario.colaboradorId },
      orderBy: { creadoEn: 'desc' },
      include: { cargo: { select: { nombre: true } } },
    }),
  ])

  // Otrosíes que el trabajador firma en la app (los viejos, sin firma, no van aquí).
  const otrosis = await prisma.otrosiContrato.findMany({
    where: { contratoId: { in: laborales.map((c) => c.id) }, requiereFirma: true },
    orderBy: { numero: 'asc' },
  })

  // Último PDF de cada tipo por contrato (el firmado si existe, si no el original):
  // el contrato en sí y la autorización de tratamiento de datos.
  const documentos = await prisma.documento.findMany({
    where: {
      OR: [
        { entidadTipo: 'ContratoOps', entidadId: { in: contratos.map((c) => c.id) } },
        { entidadTipo: 'Contrato', entidadId: { in: laborales.map((c) => c.id) } },
      ],
    },
    orderBy: { creadoEn: 'desc' },
    select: { id: true, entidadId: true, nombre: true },
  })
  /**
   * TODOS los documentos de cada contrato, no uno por casilla.
   *
   * Antes se repartían en dos casillas ("contrato" y "autorización") mirando si
   * el nombre empezaba por "Autorización". Los contratos subidos antes de que se
   * nombraran de forma descriptiva conservan el nombre del archivo original
   * (p. ej. "DOC-20260724-WA0002.pdf"), así que ninguno encajaba en la casilla
   * de autorización: los dos caían en la misma y el segundo se descartaba en
   * silencio. El colaborador veía UN documento y el otro desaparecía.
   *
   * Adivinar por el nombre es frágil; se listan todos y cada uno se muestra con
   * el nombre con el que quedó guardado.
   */
  const docsPorContrato = new Map<string, { id: string; nombre: string }[]>()
  for (const d of documentos) {
    const lista = docsPorContrato.get(d.entidadId) ?? []
    lista.push({ id: d.id, nombre: d.nombre })
    docsPorContrato.set(d.entidadId, lista)
  }

  /** Sin acentos y en minúsculas: los nombres viejos no son de fiar. */
  const esAutorizacion = (nombre: string) =>
    nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('autoriz')

  /** El PDF del contrato en sí: el primero que no sea la autorización. */
  const contratoDocId = (id: string) =>
    docsPorContrato.get(id)?.find((d) => !esAutorizacion(d.nombre))?.id ??
    docsPorContrato.get(id)?.[0]?.id ??
    null

  const TIPO_LABORAL_CORTO: Record<string, string> = {
    TERMINO_FIJO: 'Término fijo', TERMINO_INDEFINIDO: 'Término indefinido',
    OBRA_LABOR: 'Obra o labor', APRENDIZAJE_SENA: 'Aprendizaje SENA', PRACTICA: 'Práctica',
  }

  const items = [
    ...laborales.map((c) => ({
      id: c.id,
      clase: 'LABORAL' as const,
      fechaInicioMs: c.fechaInicio.getTime(),
      creadoMs: c.creadoEn.getTime(),
      numero: c.numero,
      // Para la tarjeta plegada: cargo y tipo en una línea, vigencia corta en la otra.
      resumen: [c.cargo?.nombre, TIPO_LABORAL_CORTO[c.tipo] ?? c.tipo].filter(Boolean).join(' · '),
      vigenciaCorta: c.fechaFin ? rangoBreve(c.fechaInicio, c.fechaFin) : `Desde ${fechaBreve(c.fechaInicio)}`,
      // El empleador puede haber firmado en el PDF aportado en vez de en la app.
      estado: c.firmaEmpleadoPath && (c.firmaEmpleadorPath || c.firmaEmpleadorEnPdf) ? 'FIRMADO' : c.estado,
      valorTotal: `${fmtCOP(Number(c.salarioBase))}/mes`,
      documentoId: contratoDocId(c.id),
      documentos: docsPorContrato.get(c.id) ?? [],
      firmadoPorMi: !!c.firmaEmpleadoPath,
      otrosis: otrosis
        .filter((o) => o.contratoId === c.id)
        .map((o) => ({
          id: o.id,
          numero: o.numero,
          fecha: formatFechaLarga(o.fecha),
          resumen: resumenOtrosi(o.tiposCambio, o.valoresNuevos as ValoresOtrosi | null),
          documentoId: o.documentoId,
          firmado: !!o.firmaEmpleadoPath,
          fechaFirma: o.firmaEmpleadoFecha ? formatFechaLarga(o.firmaEmpleadoFecha) : null,
        })),
      fechaMiFirma: c.firmaEmpleadoFecha ? formatFechaLarga(c.firmaEmpleadoFecha) : null,
      // Igual que en OPS: un contrato subido para firmar no tiene snapshot de plantilla.
      tieneDocumento: !!c.contenidoPdf || c.origenPdf === 'SUBIDO_PARA_FIRMA',
    })),
    ...contratos.map((c) => ({
      id: c.id,
      clase: 'OPS' as const,
      fechaInicioMs: c.fechaInicio.getTime(),
      creadoMs: c.creadoEn.getTime(),
      numero: c.numero,
      resumen: c.objeto.replace(/^Prestación de servicios como\s+/i, ''),
      vigenciaCorta: rangoBreve(c.fechaInicio, c.fechaFin),
      estado: c.estado,
      valorTotal: fmtCOP(Number(c.valorTotal)),
      documentoId: contratoDocId(c.id),
      documentos: docsPorContrato.get(c.id) ?? [],
      firmadoPorMi: !!c.firmaContratistaPath,
      fechaMiFirma: c.firmaContratistaFecha ? formatFechaLarga(c.firmaContratistaFecha) : null,
      // Un contrato subido para firmar no tiene snapshot de plantilla —el PDF es
      // el documento—, asi que la sola presencia de contenidoPdf lo dejaba fuera
      // del flujo de firma sin que nadie lo notara.
      tieneDocumento: !!c.contenidoPdf || c.origenPdf === 'SUBIDO_PARA_FIRMA',
    })),
  ]
  // Por fecha, el más reciente primero, sin importar si es laboral u OPS: quien
  // pasó de prestación de servicios a laboral ve arriba el contrato vigente.
  items.sort((a, b) => b.fechaInicioMs - a.fechaInicioMs || b.creadoMs - a.creadoMs)

  return (
    <div className="max-w-5xl">
      <Encabezado enLinea titulo="Mis contratos" />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><FilePenLine className="size-8" /><p>No tienes contratos registrados.</p></CardContent></Card>
      ) : (
        <MisContratos contratos={items} />
      )}
    </div>
  )
}

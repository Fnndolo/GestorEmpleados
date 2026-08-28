import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { FilePenLine } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
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

  const TIPO_LABORAL: Record<string, string> = {
    TERMINO_FIJO: 'Contrato de trabajo a término fijo', TERMINO_INDEFINIDO: 'Contrato de trabajo a término indefinido',
    OBRA_LABOR: 'Contrato por obra o labor', APRENDIZAJE_SENA: 'Contrato de aprendizaje SENA', PRACTICA: 'Contrato de práctica',
  }

  const items = [
    ...laborales.map((c) => ({
      id: c.id,
      clase: 'LABORAL' as const,
      numero: c.numero,
      objeto: `${TIPO_LABORAL[c.tipo] ?? c.tipo}${c.cargo ? ` — ${c.cargo.nombre}` : ''}`,
      estado: c.firmaEmpleadoPath && c.firmaEmpleadorPath ? 'FIRMADO' : c.estado,
      valorTotal: `${fmtCOP(Number(c.salarioBase))}/mes`,
      vigencia: c.fechaFin ? `${formatFechaLarga(c.fechaInicio)} — ${formatFechaLarga(c.fechaFin)}` : `Desde ${formatFechaLarga(c.fechaInicio)}`,
      documentoId: contratoDocId(c.id),
      documentos: docsPorContrato.get(c.id) ?? [],
      firmadoPorMi: !!c.firmaEmpleadoPath,
      fechaMiFirma: c.firmaEmpleadoFecha ? formatFechaLarga(c.firmaEmpleadoFecha) : null,
      tieneDocumento: !!c.contenidoPdf,
    })),
    ...contratos.map((c) => ({
      id: c.id,
      clase: 'OPS' as const,
      numero: c.numero,
      objeto: c.objeto,
      estado: c.estado,
      valorTotal: fmtCOP(Number(c.valorTotal)),
      vigencia: `${formatFechaLarga(c.fechaInicio)} — ${formatFechaLarga(c.fechaFin)}`,
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

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Mis contratos"
        descripcion="Revisa tus contratos (laborales y de prestación de servicios) y fírmalos digitalmente."
      />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><FilePenLine className="size-8" /><p>No tienes contratos registrados.</p></CardContent></Card>
      ) : (
        <MisContratos contratos={items} />
      )}
    </div>
  )
}

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
      <div className="mx-auto max-w-3xl">
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
  const docPorContrato = new Map<string, string>()
  const autorizacionPorContrato = new Map<string, string>()
  for (const d of documentos) {
    const mapa = d.nombre.startsWith('Autorización') ? autorizacionPorContrato : docPorContrato
    if (!mapa.has(d.entidadId)) mapa.set(d.entidadId, d.id)
  }

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
      documentoId: docPorContrato.get(c.id) ?? null,
      autorizacionId: autorizacionPorContrato.get(c.id) ?? null,
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
      documentoId: docPorContrato.get(c.id) ?? null,
      autorizacionId: autorizacionPorContrato.get(c.id) ?? null,
      firmadoPorMi: !!c.firmaContratistaPath,
      fechaMiFirma: c.firmaContratistaFecha ? formatFechaLarga(c.firmaContratistaFecha) : null,
      tieneDocumento: !!c.contenidoPdf,
    })),
  ]

  return (
    <div className="mx-auto max-w-3xl">
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

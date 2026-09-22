import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { documentosRequeridosDe, TIPO_CONTRATO_FIRMADO } from '@/server/expediente'
import { formatFechaCorta, formatFechaISO } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { MisDocumentos } from './mis-documentos'

export const metadata = { title: 'Mis documentos · Smart Gadgets RH' }

export default async function MisDocumentosPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado volver titulo="Mis documentos" descripcion="" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.
        </CardContent></Card>
      </div>
    )
  }

  const [colab, documentos, tipos, contratosOps] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId }, select: { tipoVinculo: true, cargoId: true } }),
    prisma.documento.findMany({
      where: { entidadTipo: 'Colaborador', entidadId: usuario.colaboradorId },
      include: { tipoDocumento: { select: { id: true, nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.contratoOps.findMany({ where: { colaboradorId: usuario.colaboradorId }, select: { id: true } }),
  ])

  // PDFs de sus contratos OPS (contrato generado/firmado, autorización de datos)
  const docsContratos = contratosOps.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'ContratoOps', entidadId: { in: contratosOps.map((c) => c.id) } },
        orderBy: { creadoEn: 'desc' },
      })
    : []

  // Documentos requeridos por su vínculo (y su cargo) que aún no ha entregado.
  // El contrato firmado no lo sube él: sale del módulo de Contratos.
  const requeridos = await documentosRequeridosDe(colab)
  const tiposRequeridos = new Set(requeridos.map((r) => r.tipoDocumentoId))
  // Vienen del más reciente al más antiguo: el primero de cada tipo es el vigente.
  const vigentePorTipo = new Map<string, (typeof documentos)[number]>()
  for (const d of documentos) if (d.tipoDocumentoId && !vigentePorTipo.has(d.tipoDocumentoId)) vigentePorTipo.set(d.tipoDocumentoId, d)
  const hoy = new Date()
  const exigidos = requeridos
    .filter((r) => r.tipoDocumento.nombre !== TIPO_CONTRATO_FIRMADO)
    .map((r) => {
      const doc = vigentePorTipo.get(r.tipoDocumentoId) ?? null
      const vencido = !!doc?.fechaVencimiento && doc.fechaVencimiento < hoy
      return {
        id: r.tipoDocumentoId,
        nombre: r.tipoDocumento.nombre,
        requiereVencimiento: r.tipoDocumento.requiereVencimiento,
        obligatorio: r.obligatorio,
        estado: (!doc ? 'falta' : vencido ? 'vencido' : 'al_dia') as 'falta' | 'vencido' | 'al_dia',
        docId: doc?.id ?? null,
        docEsImagen: doc?.mimeType.startsWith('image/') ?? false,
        docNombre: doc?.nombre ?? null,
        docFecha: doc ? formatFechaCorta(doc.creadoEn) : null,
      }
    })

  /** Categoría para filtrar: expediente (requeridos/tipificados), desprendibles, certificaciones, actas, contratos u otros. */
  function categoria(nombre: string, tipoDocumentoId: string | null): string {
    const n = nombre.toLowerCase()
    if (n.includes('desprendible') || n.includes('nómina')) return 'Desprendibles'
    if (n.includes('certificación') || n.includes('certificado laboral')) return 'Certificaciones'
    if (n.includes('acta')) return 'Actas'
    if (n.includes('contrato') || n.includes('otrosí') || n.includes('autorización de datos')) return 'Contratos'
    if (tipoDocumentoId && tiposRequeridos.has(tipoDocumentoId)) return 'Expediente'
    if (tipoDocumentoId) return 'Expediente'
    return 'Otros'
  }

  return (
    <div className="max-w-5xl">
      <Encabezado
        volver
        titulo="Mis documentos"
        descripcion="Tu expediente: lo que has entregado y lo que te falta. Lo que subas lo revisa Talento Humano."
      />
      <MisDocumentos
        colaboradorId={usuario.colaboradorId}
        exigidos={exigidos}
        tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre, requiereVencimiento: t.requiereVencimiento }))}
        documentos={[
          ...documentos.map((d) => ({
            id: d.id,
            nombre: d.nombre,
            tipo: d.tipoDocumento?.nombre ?? null,
            categoria: categoria(d.nombre, d.tipoDocumentoId),
            fecha: formatFechaCorta(d.creadoEn),
            vence: d.fechaVencimiento ? formatFechaCorta(d.fechaVencimiento) : null,
            esImagen: d.mimeType.startsWith('image/'),
            // Solo puede corregir/borrar lo que él mismo subió (no lo que produce la empresa).
            editable: d.subidoPorId === usuario.id,
            tipoId: d.tipoDocumentoId,
            descripcion: d.descripcion,
            venceIso: d.fechaVencimiento ? formatFechaISO(d.fechaVencimiento) : null,
          })),
          ...docsContratos.map((d) => ({
            id: d.id,
            nombre: d.nombre,
            tipo: null,
            categoria: 'Contratos',
            fecha: formatFechaCorta(d.creadoEn),
            vence: null,
            esImagen: d.mimeType.startsWith('image/'),
            editable: false,
            tipoId: null,
            descripcion: null,
            venceIso: null,
          })),
        ]}
      />
    </div>
  )
}

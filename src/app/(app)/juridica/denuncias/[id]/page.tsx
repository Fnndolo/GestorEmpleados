import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatFechaLarga } from '@/lib/fechas'
import { etiquetaReporte, esAcoso } from '@/lib/linea-etica'
import { SoportesEntidad } from '../../_ui'
import { AccionesDenuncia } from './acciones-denuncia'

export const metadata = { title: 'Reporte de la línea ética · Smart Gadgets RH' }

const ESTADO: Record<string, string> = { RECIBIDA: 'Recibida', EN_INVESTIGACION: 'En investigación', RESUELTA: 'Resuelta', ARCHIVADA: 'Archivada' }

export default async function DenunciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('juridica', 'VER')
  const puedeEditar = tienePermiso(usuario, 'juridica', 'EDITAR')

  const d = await prisma.denunciaAcoso.findUnique({ where: { id } })
  if (!d) notFound()

  const evidencias = await prisma.documento.findMany({
    where: { entidadTipo: 'DenunciaAcoso', entidadId: id },
    orderBy: { creadoEn: 'asc' },
    select: { id: true, nombre: true, mimeType: true },
  })
  const acuerdo = d.documentoResolucionId ? evidencias.find((x) => x.id === d.documentoResolucionId) ?? null : null
  const soportes = evidencias.filter((x) => x.id !== d.documentoResolucionId)

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo={`Denuncia ${d.codigo}`}
        descripcion={`${etiquetaReporte(d.tipo)} · ${d.anonima ? 'reporte anónimo' : `reportado por ${d.denuncianteNombre ?? '—'}`}${esAcoso(d.tipo) ? ' · Comité de Convivencia (Ley 1010 / Ley 2466 de 2025)' : ''}`}
        acciones={<Badge variant={d.estado === 'RESUELTA' ? 'default' : 'secondary'}>{ESTADO[d.estado]}</Badge>}
      />

      <Card className="mb-4"><CardContent className="py-4 space-y-2 text-sm">
        <p><span className="font-medium">Hechos:</span> {d.hechos}</p>
        {d.fechaHechos && <p className="text-muted-foreground">Fecha de los hechos: {formatFechaLarga(d.fechaHechos)}</p>}
        {d.resolucion && <p><span className="font-medium">Resolución:</span> {d.resolucion}</p>}
      </CardContent></Card>

      <SoportesEntidad entidadTipo="DenunciaAcoso" entidadId={d.id} documentos={soportes} puedeEditar={puedeEditar} titulo="Evidencias (PDF, fotos, mensajes, videos)" />

      {acuerdo && (
        <Card className="mb-4"><CardContent className="py-3 flex items-center gap-3">
          <FileText className="size-5 text-muted-foreground shrink-0" />
          <span className="text-sm flex-1 truncate">Acuerdo / resolución final: {acuerdo.nombre}</span>
          <Button size="sm" variant="outline" asChild><a href={`/api/documentos/${acuerdo.id}`} target="_blank" rel="noreferrer">Abrir</a></Button>
        </CardContent></Card>
      )}

      {puedeEditar && (d.estado === 'RECIBIDA' || d.estado === 'EN_INVESTIGACION') && <AccionesDenuncia id={d.id} estado={d.estado} />}
    </div>
  )
}

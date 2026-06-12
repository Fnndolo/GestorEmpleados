import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga } from '@/lib/fechas'
import { Asistencia } from './asistencia'

export const metadata = { title: 'Capacitación · Smart Gadgets RH' }

const TIPO: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }

export default async function CapacitacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('capacitaciones', 'VER')
  const puedeEditar = tienePermiso(usuario, 'capacitaciones', 'EDITAR')

  const c = await prisma.capacitacion.findUnique({
    where: { id },
    include: { asistencias: { include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { colaborador: { apellidos: 'asc' } } } },
  })
  if (!c) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo={c.titulo} descripcion={`${TIPO[c.tipo]} · ${formatFechaLarga(c.fecha)}`} acciones={<Badge variant="outline">{c.asistencias.length} asistentes</Badge>} />
      {c.descripcion && <Card className="mb-4"><CardContent className="py-3 text-sm text-muted-foreground">{c.descripcion}</CardContent></Card>}
      <Asistencia
        capacitacionId={c.id}
        puedeEditar={puedeEditar}
        asistentes={c.asistencias.map((a) => ({ id: a.id, colaborador: `${a.colaborador.nombres} ${a.colaborador.apellidos}`, evaluacion: a.evaluacion ? Number(a.evaluacion) : null }))}
      />
    </div>
  )
}

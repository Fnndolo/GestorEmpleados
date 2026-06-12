import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { CrearEvaluacion } from './crear-evaluacion'

export const metadata = { title: 'Evaluaciones · Smart Gadgets RH' }

export default async function EvaluacionesPage() {
  const usuario = await requerirPermiso('evaluaciones', 'VER')
  const puedeCrear = tienePermiso(usuario, 'evaluaciones', 'CREAR')

  const evaluaciones = await prisma.evaluacionDesempeno.findMany({
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
    orderBy: { fecha: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Evaluación de desempeño" descripcion="Resultados de evaluación por colaborador y periodo." acciones={puedeCrear && <CrearEvaluacion />} />
      {evaluaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><ClipboardCheck className="size-8" /><p>Sin evaluaciones registradas.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {evaluaciones.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3">
              <ClipboardCheck className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{e.colaborador.nombres} {e.colaborador.apellidos}</p>
                <p className="text-xs text-muted-foreground">{e.periodo} · {formatFechaCorta(e.fecha)}</p>
              </div>
              <Badge variant={Number(e.puntaje) >= 70 ? 'default' : 'secondary'}>{Number(e.puntaje)} / 100</Badge>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}

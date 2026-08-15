import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck } from 'lucide-react'
import { Chip, Pill } from '@/components/ui-kit'
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
    <div className="max-w-6xl">
      <Encabezado titulo="Evaluación de desempeño" descripcion="Resultados de evaluación por colaborador y periodo." acciones={puedeCrear && <CrearEvaluacion />} />
      {evaluaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><ClipboardCheck className="size-8" /><p>Sin evaluaciones registradas.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {evaluaciones.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3">
              <Chip icono={ClipboardCheck} color="indigo" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.colaborador.nombres} {e.colaborador.apellidos}</p>
                <p className="text-xs text-muted-foreground">{e.periodo} · {formatFechaCorta(e.fecha)}</p>
              </div>
              <Pill tone={Number(e.puntaje) >= 70 ? 'ok' : Number(e.puntaje) >= 50 ? 'warn' : 'bad'}>{Number(e.puntaje)} / 100</Pill>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}

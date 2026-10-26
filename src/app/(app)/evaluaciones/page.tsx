import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck } from 'lucide-react'
import { Pill, AvatarColaborador } from '@/components/ui-kit'
import { formatFechaCorta, formatFechaISO } from '@/lib/fechas'
import { urlFoto } from '@/lib/foto'
import { CrearEvaluacion, AccionesEvaluacion } from './crear-evaluacion'

export const metadata = { title: 'Evaluaciones · Smart Gadgets RH' }

export default async function EvaluacionesPage() {
  const usuario = await requerirPermiso('evaluaciones', 'VER')
  const puedeCrear = tienePermiso(usuario, 'evaluaciones', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'evaluaciones', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'evaluaciones', 'ELIMINAR')

  const evaluaciones = await prisma.evaluacionDesempeno.findMany({
    include: { colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } },
    orderBy: { fecha: 'desc' },
    take: 100,
  })

  return (
    <div className="max-w-6xl">
      <Encabezado titulo="Evaluación de desempeño" descripcion="Resultados de evaluación por colaborador y periodo." acciones={puedeCrear && <CrearEvaluacion />} volver />
      {evaluaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><ClipboardCheck className="size-8" /><p>Sin evaluaciones registradas.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {evaluaciones.map((e) => {
            const colaborador = `${e.colaborador.nombres} ${e.colaborador.apellidos}`
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 p-3">
                <AvatarColaborador nombre={colaborador} fotoUrl={urlFoto(e.colaborador.id, e.colaborador.fotoPath, true)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{colaborador}</p>
                  <p className="text-xs text-muted-foreground">{e.periodo} · {formatFechaCorta(e.fecha)}</p>
                </div>
                <Pill tone={Number(e.puntaje) >= 70 ? 'ok' : Number(e.puntaje) >= 50 ? 'warn' : 'bad'}>{Number(e.puntaje)} / 100</Pill>
                <AccionesEvaluacion
                  evaluacion={{
                    id: e.id, colaboradorId: e.colaboradorId, colaborador, periodo: e.periodo, puntaje: Number(e.puntaje),
                    fecha: formatFechaISO(e.fecha), fortalezas: e.fortalezas, oportunidades: e.oportunidades, compromisos: e.compromisos,
                  }}
                  puedeEditar={puedeEditar}
                  puedeEliminar={puedeEliminar}
                />
              </div>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}

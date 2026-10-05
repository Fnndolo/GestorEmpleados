import { CalendarDays, ChevronRight, Clock, Eye } from 'lucide-react'
import { prisma } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Pill } from '@/components/ui-kit'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { AsignarHorario, type PlantillaHorario } from '@/components/horarios/asignar-horario'
import { CancelarCambio } from '@/components/horarios/cancelar-cambio'
import { TraerDeAsistencia } from '@/components/horarios/traer-de-asistencia'
import { TablaHorario } from '@/components/horarios/tabla-horario'
import { conexionAsistencia } from '@/server/asistencia/cliente'
import { horasSemana, resumenHorario, textoHoras, type DiasHorario } from '@/lib/horarios'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { formatFechaISO, hoyBogota } from '@/lib/fechas'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Pestaña Horario de la ficha: el horario de hoy, el cambio programado (si lo
 * hay), los próximos domingos y festivos que le tocan y el historial con las
 * comunicaciones enviadas. Quien puede editar cambia el horario desde aquí.
 */
export async function HorarioFicha({ colaboradorId, nombre, puedeEditar }: { colaboradorId: string; nombre: string; puedeEditar: boolean }) {
  const hoy = hoyBogota()
  const [asignaciones, plantillasBd, conAsistencia, turnos] = await Promise.all([
    prisma.asignacionHorario.findMany({ where: { colaboradorId }, orderBy: { desde: 'desc' }, include: { horario: { select: { nombre: true } } } }),
    puedeEditar ? prisma.horario.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }) : Promise.resolve([]),
    conexionAsistencia('horarios').then(Boolean),
    prisma.turnoDominical.findMany({ where: { colaboradorId, fecha: { gte: hoy } }, orderBy: { fecha: 'asc' }, take: 8, select: { fecha: true } }),
  ])
  const plantillas: PlantillaHorario[] = plantillasBd.map((p) => ({ id: p.id, nombre: p.nombre, dias: p.dias as DiasHorario }))
  const vigente = asignaciones.find((a) => a.desde <= hoy && (!a.hasta || a.hasta >= hoy)) ?? null
  const programada = asignaciones.find((a) => a.desde > hoy) ?? null
  const dias = vigente?.dias as DiasHorario | undefined

  return (
    <div className="grid items-start gap-3 lg:grid-cols-3">
      <Card className="py-0 lg:col-span-2"><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 basis-40">
            <h3 className="text-sm font-semibold">{vigente ? vigente.horario?.nombre ?? 'Horario propio' : 'Sin horario asignado'}</h3>
            {vigente && dias && <p className="text-xs text-muted-foreground">{textoHoras(horasSemana(dias))} a la semana</p>}
          </div>
          {puedeEditar && conAsistencia && <TraerDeAsistencia colaboradorId={colaboradorId} />}
          {puedeEditar && (
            <AsignarHorario
              colaboradorId={colaboradorId} nombre={nombre} plantillas={plantillas} hoy={formatFechaISO(hoy)} conAsistencia={conAsistencia}
              actual={vigente ? { horarioId: vigente.horarioId, dias: vigente.dias as DiasHorario } : null}
              etiqueta={vigente ? 'Cambiar horario' : 'Asignar horario'}
            />
          )}
        </div>
        {vigente && dias ? (
          <>
            <TablaHorario dias={dias} />
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Desde el {fechaBreve(vigente.desde)}{vigente.origen === 'ASISTENCIA' ? ' · traído de AsistencIA' : ''}
              {conAsistencia && (vigente.errorSincronizacion
                ? <span title={vigente.errorSincronizacion}><Pill tone="bad">No llegó a AsistencIA</Pill></span>
                : vigente.sincronizadoEn ? <Pill tone="ok">En AsistencIA</Pill> : <Pill tone="muted">Pendiente en AsistencIA</Pill>)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no tiene horario aquí. {puedeEditar ? 'Asígnale uno, o tráelo de AsistencIA desde Horarios.' : ''}</p>
        )}

        {programada && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1">
                <span className="font-medium">Desde el {fechaBreve(programada.desde)} cambia a {programada.horario?.nombre ?? 'un horario propio'}</span>
                <span className="block text-xs text-muted-foreground">{resumenHorario(programada.dias as DiasHorario)}</span>
              </p>
              {puedeEditar && <CancelarCambio asignacionId={programada.id} />}
            </div>
          </div>
        )}
      </CardContent></Card>

      <Card className="py-0"><CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Próximos domingos y festivos</h3>
        </div>
        {turnos.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {turnos.map((t) => (
              <li key={t.fecha.toISOString()} className="rounded-full border px-2.5 py-0.5 text-xs">{DIAS[t.fecha.getUTCDay()]} {fechaBreve(t.fecha)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tiene domingos ni festivos asignados.</p>
        )}
      </CardContent></Card>

      {asignaciones.length > 0 && (
        <Card className="py-0 lg:col-span-3"><CardContent className="p-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              Historial de horarios ({asignaciones.length})
            </summary>
            <ul className="mt-3 divide-y rounded-lg border">
              {asignaciones.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="w-44 shrink-0 tabular-nums text-muted-foreground">
                    {fechaBreve(a.desde)} – {a.hasta ? fechaBreve(a.hasta) : a.desde > hoy ? '' : 'hoy'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.horario?.nombre ?? 'Horario propio'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {resumenHorario(a.dias as DiasHorario)}{a.motivo ? ` · ${a.motivo}` : ''}{a.origen === 'ASISTENCIA' ? ' · de AsistencIA' : ''}
                    </span>
                  </span>
                  {a.documentoId && (
                    <VisorPdf documentoId={a.documentoId} titulo={`Cambio de horario · ${nombre}`} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
                      <Eye className="size-4" /> Comunicación
                    </VisorPdf>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </CardContent></Card>
      )}
    </div>
  )
}

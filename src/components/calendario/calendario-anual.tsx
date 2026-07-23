'use client'

import { useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronRight as Arrow, X, CalendarDays,
  TreePalm, PartyPopper, Clock, FileText, Users, CalendarCheck, Stethoscope, Ban, CalendarX,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { EventoAnio } from '@/server/consultas/eventos-colaborador'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type IconType = ComponentType<{ className?: string }>
type TipoEvento = { dot: string; soft: string; chip: string; text: string; icono: IconType; nombre: string }

const TIPOS: Record<string, TipoEvento> = {
  fin_contrato: { dot: 'bg-orange-500', soft: 'bg-orange-50 dark:bg-orange-500/10', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300', text: 'text-orange-600 dark:text-orange-400', icono: CalendarX, nombre: 'Fin de contrato' },
  vacaciones: { dot: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-500/10', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300', text: 'text-emerald-600 dark:text-emerald-400', icono: TreePalm, nombre: 'Vacaciones' },
  permiso: { dot: 'bg-blue-500', soft: 'bg-blue-50 dark:bg-blue-500/10', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300', text: 'text-blue-600 dark:text-blue-400', icono: Clock, nombre: 'Permiso' },
  licencia: { dot: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-500/10', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300', text: 'text-amber-600 dark:text-amber-400', icono: FileText, nombre: 'Licencia' },
  dia_familia: { dot: 'bg-purple-500', soft: 'bg-purple-50 dark:bg-purple-500/10', chip: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300', text: 'text-purple-600 dark:text-purple-400', icono: Users, nombre: 'Día de la familia' },
  compensatorio: { dot: 'bg-teal-500', soft: 'bg-teal-50 dark:bg-teal-500/10', chip: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300', text: 'text-teal-600 dark:text-teal-400', icono: CalendarCheck, nombre: 'Compensatorio' },
  incapacidad: { dot: 'bg-red-500', soft: 'bg-red-50 dark:bg-red-500/10', chip: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300', text: 'text-red-600 dark:text-red-400', icono: Stethoscope, nombre: 'Incapacidad' },
  suspension: { dot: 'bg-slate-500', soft: 'bg-slate-100 dark:bg-slate-500/15', chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300', text: 'text-slate-600 dark:text-slate-400', icono: Ban, nombre: 'Suspensión' },
  festivo: { dot: 'bg-rose-400', soft: 'bg-rose-50 dark:bg-rose-500/10', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', text: 'text-rose-500 dark:text-rose-400', icono: PartyPopper, nombre: 'Festivo' },
}
const tipo = (t: string): TipoEvento => TIPOS[t] ?? { dot: 'bg-gray-400', soft: 'bg-gray-50', chip: 'bg-gray-100 text-gray-700', text: 'text-gray-600', icono: FileText, nombre: t }

// Orden de aparición en el resumen (lo más relevante primero).
const ORDEN = ['fin_contrato', 'vacaciones', 'permiso', 'licencia', 'dia_familia', 'compensatorio', 'incapacidad', 'suspension', 'festivo']

/** Texto del resumen: "3 días de vacaciones", "2 festivos", etc. */
function etiquetaResumen(t: string, n: number): string {
  const uno = n === 1
  switch (t) {
    case 'vacaciones': return `${n} ${uno ? 'día' : 'días'} de vacaciones`
    case 'festivo': return `${n} ${uno ? 'festivo' : 'festivos'}`
    case 'permiso': return `${n} ${uno ? 'permiso' : 'permisos'}`
    case 'licencia': return `${n} ${uno ? 'licencia' : 'licencias'}`
    case 'dia_familia': return `${n} ${uno ? 'día de la familia' : 'días de la familia'}`
    case 'compensatorio': return `${n} ${uno ? 'compensatorio' : 'compensatorios'}`
    case 'incapacidad': return `${n} ${uno ? 'día' : 'días'} de incapacidad`
    case 'suspension': return `${n} ${uno ? 'día' : 'días'} de suspensión`
    default: return `${n} ${tipo(t).nombre}`
  }
}

type Hoy = { anio: number; mes: number; dia: number }

function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primer = new Date(Date.UTC(anio, mes - 1, 1))
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const offset = (primer.getUTCDay() + 6) % 7
  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)]
  while (celdas.length % 7 !== 0) celdas.push(null)
  return celdas
}

export function CalendarioAnual({
  anio, eventos, hoy, baseHref,
}: {
  anio: number; eventos: EventoAnio[]; hoy: Hoy; baseHref: string
}) {
  const [mesExpandido, setMesExpandido] = useState<number | null>(null)

  // Agrupar por mes → día y por mes → conteos por tipo.
  const { porMesDia, resumenMes } = useMemo(() => {
    const porMesDia = new Map<number, Map<number, EventoAnio[]>>()
    const resumenMes = new Map<number, { conteos: Map<string, number>; finContrato: EventoAnio | null }>()
    for (let m = 1; m <= 12; m++) resumenMes.set(m, { conteos: new Map(), finContrato: null })
    for (const e of eventos) {
      if (!porMesDia.has(e.mes)) porMesDia.set(e.mes, new Map())
      const dias = porMesDia.get(e.mes)!
      const arr = dias.get(e.dia) ?? []
      arr.push(e)
      dias.set(e.dia, arr)

      const r = resumenMes.get(e.mes)!
      if (e.tipo === 'fin_contrato') r.finContrato = e
      else r.conteos.set(e.tipo, (r.conteos.get(e.tipo) ?? 0) + 1)
    }
    return { porMesDia, resumenMes }
  }, [eventos])

  const esHoy = (mes: number, dia: number) => hoy.anio === anio && hoy.mes === mes && hoy.dia === dia

  return (
    <div className="space-y-4">
      {/* Barra de año */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link href={`${baseHref}?anio=${anio - 1}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Año anterior">
            <ChevronLeft className="size-5" />
          </Link>
          <h2 className="min-w-[4ch] text-center text-xl font-semibold tabular-nums">{anio}</h2>
          <Link href={`${baseHref}?anio=${anio + 1}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Año siguiente">
            <ChevronRight className="size-5" />
          </Link>
        </div>
        {hoy.anio !== anio && (
          <Link href={baseHref} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <CalendarDays className="size-3.5" /> Ir a hoy
          </Link>
        )}
      </div>

      {mesExpandido === null ? (
        /* ── Vista anual: 12 tarjetas de resumen ── */
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {MESES.map((nombre, idx) => {
            const mes = idx + 1
            const r = resumenMes.get(mes)!
            const tipos = ORDEN.filter((t) => t !== 'fin_contrato' && (r.conteos.get(t) ?? 0) > 0)
            const vacio = tipos.length === 0 && !r.finContrato
            const esMesActual = hoy.anio === anio && hoy.mes === mes
            return (
              <button
                key={mes}
                type="button"
                onClick={() => setMesExpandido(mes)}
                className={cn(
                  'group flex flex-col rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4',
                  esMesActual && 'border-primary/50 ring-1 ring-primary/20',
                )}
              >
                <div className="mb-2 flex items-center justify-between sm:mb-3">
                  <span className="text-sm font-semibold sm:text-base">{nombre}</span>
                  <Arrow className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>

                {r.finContrato && (
                  <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300 sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-xs">
                    <CalendarX className="size-3.5 shrink-0 sm:size-4" />
                    <span>Finaliza contrato · {r.finContrato.dia} {nombre.slice(0, 3).toLowerCase()}</span>
                  </div>
                )}

                {vacio ? (
                  <p className="flex-1 text-xs text-muted-foreground/70 sm:text-sm">Sin novedades</p>
                ) : (
                  <ul className="flex-1 space-y-1 sm:space-y-1.5">
                    {tipos.map((t) => {
                      const T = tipo(t)
                      const Icono = T.icono
                      return (
                        <li key={t} className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
                          <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md sm:size-6', T.soft)}>
                            <Icono className={cn('size-3 sm:size-3.5', T.text)} />
                          </span>
                          <span className="min-w-0 text-foreground">{etiquetaResumen(t, r.conteos.get(t)!)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <span className="mt-2 hidden text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:mt-3 sm:block">
                  Ver mes →
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <MesExpandido
          anio={anio}
          mes={mesExpandido}
          dias={porMesDia.get(mesExpandido)}
          esHoy={(dia) => esHoy(mesExpandido, dia)}
          onVolver={() => setMesExpandido(null)}
          onCambiarMes={(m) => setMesExpandido(m)}
        />
      )}

      <Leyenda eventos={eventos} />
    </div>
  )
}

function Tooltip({ eventos }: { eventos: EventoAnio[] }) {
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden w-max max-w-[200px] -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-left text-popover-foreground shadow-md group-hover:block">
      <div className="space-y-1">
        {eventos.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className={cn('size-2 shrink-0 rounded-full', tipo(e.tipo).dot)} />
            <span className="truncate">{e.etiqueta}</span>
          </div>
        ))}
      </div>
      <span className="absolute left-1/2 top-full -mt-px size-2 -translate-x-1/2 rotate-45 border-b border-r bg-popover" />
    </div>
  )
}

function MesExpandido({
  anio, mes, dias, esHoy, onVolver, onCambiarMes,
}: {
  anio: number
  mes: number
  dias: Map<number, EventoAnio[]> | undefined
  esHoy: (dia: number) => boolean
  onVolver: () => void
  onCambiarMes: (mes: number) => void
}) {
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)
  return (
    <Card className="animate-in fade-in zoom-in-95 duration-200">
      <CardContent className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => onCambiarMes(mes === 1 ? 12 : mes - 1)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Mes anterior">
            <ChevronLeft className="size-5" />
          </button>
          <h3 className="text-lg font-semibold">{MESES[mes - 1]} {anio}</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onCambiarMes(mes === 12 ? 1 : mes + 1)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Mes siguiente">
              <ChevronRight className="size-5" />
            </button>
            <button type="button" onClick={onVolver} className="ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <X className="size-3.5" /> Ver año
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((d, i) => (
            <div key={i} className={cn('pb-1 text-center text-xs font-medium text-muted-foreground', i >= 5 && 'text-muted-foreground/60')}>{d}</div>
          ))}
          {celdasDelMes(anio, mes).map((dia, i) => {
            if (dia === null) return <div key={i} />
            const evs = dias?.get(dia) ?? []
            const finde = i % 7 >= 5
            const conEventos = evs.length > 0
            const contenido = (
              <>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-medium', esHoy(dia) && 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground')}>{dia}</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {evs.slice(0, 3).map((e, j) => (
                    <div key={j} className={cn('truncate rounded px-1 py-px text-[8px] font-medium leading-tight sm:text-[10px]', tipo(e.tipo).chip)} title={e.etiqueta}>
                      {e.etiqueta}
                    </div>
                  ))}
                  {evs.length > 3 && <div className="px-1 text-[8px] text-muted-foreground sm:text-[10px]">+{evs.length - 3} más</div>}
                </div>
                {conEventos && <Tooltip eventos={evs} />}
              </>
            )
            const clases = cn(
              'group relative min-h-[76px] rounded-lg border p-1.5 text-left transition-colors',
              finde && 'bg-muted/30',
              conEventos && 'border-transparent',
              evs[0] && tipo(evs[0].tipo).soft,
              esHoy(dia) && 'ring-2 ring-primary',
            )
            // Un día con eventos se puede abrir en detalle; uno vacío no es interactivo.
            return conEventos ? (
              <button
                key={i}
                type="button"
                onClick={() => setDiaAbierto(dia)}
                className={cn(clases, 'cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110')}
                aria-label={`Ver eventos del ${dia} de ${MESES[mes - 1].toLowerCase()}`}
              >
                {contenido}
              </button>
            ) : (
              <div key={i} className={clases}>{contenido}</div>
            )
          })}
        </div>

        <DiaDialog
          anio={anio}
          mes={mes}
          dia={diaAbierto}
          eventos={diaAbierto !== null ? dias?.get(diaAbierto) ?? [] : []}
          onClose={() => setDiaAbierto(null)}
        />
      </CardContent>
    </Card>
  )
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Ventana emergente con el detalle completo de un día: fecha y sus eventos ampliados. */
function DiaDialog({
  anio, mes, dia, eventos, onClose,
}: {
  anio: number; mes: number; dia: number | null; eventos: EventoAnio[]; onClose: () => void
}) {
  const nombreDia = dia !== null ? DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()] : ''
  return (
    <Dialog open={dia !== null} onOpenChange={(abierto) => { if (!abierto) onClose() }}>
      <DialogContent className="max-w-[calc(100%-2.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {nombreDia}, {dia} de {MESES[mes - 1].toLowerCase()} de {anio}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {eventos.map((e, i) => {
            const T = tipo(e.tipo)
            const Icono = T.icono
            return (
              <div key={i} className={cn('flex items-start gap-3 rounded-lg p-3', T.soft)}>
                <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-background/60')}>
                  <Icono className={cn('size-4', T.text)} />
                </span>
                <div className="min-w-0">
                  <p className={cn('text-xs font-semibold uppercase tracking-wide', T.text)}>{T.nombre}</p>
                  <p className="mt-0.5 text-sm leading-snug">{e.etiqueta}</p>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Leyenda({ eventos }: { eventos: EventoAnio[] }) {
  const tipos = ORDEN.filter((t) => eventos.some((e) => e.tipo === t))
  if (tipos.length === 0) {
    return <p className="pt-2 text-center text-sm text-muted-foreground">Sin novedades registradas este año.</p>
  }
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t pt-4">
      {tipos.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-2.5 rounded-full', tipo(t).dot)} />
          {tipo(t).nombre}
        </span>
      ))}
    </div>
  )
}

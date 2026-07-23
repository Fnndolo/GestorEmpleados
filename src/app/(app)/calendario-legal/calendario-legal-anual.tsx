'use client'

import { useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, X, CalendarDays, RefreshCw, CircleCheck, TriangleAlert,
  Landmark, Receipt, Briefcase, FileLock, Store, HardHat, FileText, Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { completarOcurrencia, generarCalendario } from './acciones'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type IconType = ComponentType<{ className?: string }>
type Cat = { nombre: string; icono: IconType; text: string; soft: string; chip: string; dot: string }

const CATS: Record<string, Cat> = {
  SOCIETARIO: { nombre: 'Societario', icono: Landmark, text: 'text-indigo-600 dark:text-indigo-400', soft: 'bg-indigo-50 dark:bg-indigo-500/10', chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300', dot: 'bg-indigo-500' },
  TRIBUTARIO: { nombre: 'Tributario', icono: Receipt, text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-50 dark:bg-amber-500/10', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300', dot: 'bg-amber-500' },
  LABORAL: { nombre: 'Laboral', icono: Briefcase, text: 'text-blue-600 dark:text-blue-400', soft: 'bg-blue-50 dark:bg-blue-500/10', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300', dot: 'bg-blue-500' },
  HABEAS_DATA: { nombre: 'Habeas data', icono: FileLock, text: 'text-purple-600 dark:text-purple-400', soft: 'bg-purple-50 dark:bg-purple-500/10', chip: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300', dot: 'bg-purple-500' },
  COMERCIAL: { nombre: 'Comercial', icono: Store, text: 'text-teal-600 dark:text-teal-400', soft: 'bg-teal-50 dark:bg-teal-500/10', chip: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300', dot: 'bg-teal-500' },
  SST: { nombre: 'SST', icono: HardHat, text: 'text-orange-600 dark:text-orange-400', soft: 'bg-orange-50 dark:bg-orange-500/10', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300', dot: 'bg-orange-500' },
  CONTRACTUAL: { nombre: 'Contractual', icono: FileText, text: 'text-slate-600 dark:text-slate-400', soft: 'bg-slate-100 dark:bg-slate-500/15', chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300', dot: 'bg-slate-500' },
}
const cat = (c: string): Cat => CATS[c] ?? CATS.CONTRACTUAL

export type ItemLegal = {
  id: string; mes: number; dia: number; nombre: string; categoria: string
  fuente: string | null; cumplida: boolean; vencida: boolean
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

export function CalendarioLegalAnual({
  anio, items, hoy, puedeEditar, puedeGenerar,
}: {
  anio: number; items: ItemLegal[]; hoy: Hoy; puedeEditar: boolean; puedeGenerar: boolean
}) {
  const router = useRouter()
  const [mesExpandido, setMesExpandido] = useState<number | null>(null)
  const [generando, setGenerando] = useState(false)

  async function generar() {
    setGenerando(true)
    const res = await generarCalendario({})
    setGenerando(false)
    if (res.ok) { toast.success(`${(res.datos as { creadas: number }).creadas} ocurrencia(s) generada(s).`); router.refresh() } else toast.error(res.error)
  }

  const porMes = useMemo(() => {
    const map = new Map<number, ItemLegal[]>()
    for (const it of items) {
      const arr = map.get(it.mes) ?? []
      arr.push(it)
      map.set(it.mes, arr)
    }
    return map
  }, [items])

  return (
    <div className="space-y-4">
      {/* Barra de año */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link href={`/calendario-legal?anio=${anio - 1}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Año anterior">
            <ChevronLeft className="size-5" />
          </Link>
          <h2 className="min-w-[4ch] text-center text-xl font-semibold tabular-nums">{anio}</h2>
          <Link href={`/calendario-legal?anio=${anio + 1}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Año siguiente">
            <ChevronRight className="size-5" />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {hoy.anio !== anio && (
            <Link href="/calendario-legal" className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <CalendarDays className="size-3.5" /> Ir a hoy
            </Link>
          )}
          {puedeGenerar && (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link href="/calendario-legal/obligaciones"><Settings2 className="size-4" /> Gestionar obligaciones</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={generar} disabled={generando}>
                {generando ? <Spinner /> : <RefreshCw className="size-4" />} Generar próximas fechas
              </Button>
            </>
          )}
        </div>
      </div>

      {mesExpandido === null ? (
        /* ── Vista anual: 12 tarjetas de resumen ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MESES.map((nombre, idx) => {
            const mes = idx + 1
            const lista = porMes.get(mes) ?? []
            const vencidas = lista.filter((i) => i.vencida).length
            const cumplidas = lista.filter((i) => i.cumplida).length
            const pendientesPorCat = new Map<string, number>()
            for (const i of lista) {
              if (!i.cumplida && !i.vencida) pendientesPorCat.set(i.categoria, (pendientesPorCat.get(i.categoria) ?? 0) + 1)
            }
            const esMesActual = hoy.anio === anio && hoy.mes === mes
            return (
              <button
                key={mes}
                type="button"
                onClick={() => setMesExpandido(mes)}
                className={cn(
                  'group flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  esMesActual && 'border-primary/50 ring-1 ring-primary/20',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{nombre}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>

                {vencidas > 0 && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                    <TriangleAlert className="size-4 shrink-0" />
                    <span>{vencidas} {vencidas === 1 ? 'obligación vencida' : 'obligaciones vencidas'}</span>
                  </div>
                )}

                {lista.length === 0 ? (
                  <p className="flex-1 text-sm text-muted-foreground/70">Sin obligaciones</p>
                ) : (
                  <ul className="flex-1 space-y-1.5">
                    {[...pendientesPorCat.entries()].map(([c, n]) => {
                      const C = cat(c)
                      const Icono = C.icono
                      return (
                        <li key={c} className="flex items-center gap-2 text-sm">
                          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', C.soft)}>
                            <Icono className={cn('size-3.5', C.text)} />
                          </span>
                          <span>{n} {C.nombre.toLowerCase()}</span>
                        </li>
                      )
                    })}
                    {cumplidas > 0 && (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-500/10">
                          <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <span>{cumplidas} {cumplidas === 1 ? 'cumplida' : 'cumplidas'}</span>
                      </li>
                    )}
                  </ul>
                )}

                <span className="mt-3 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">Ver mes →</span>
              </button>
            )
          })}
        </div>
      ) : (
        <MesExpandido
          anio={anio}
          mes={mesExpandido}
          items={porMes.get(mesExpandido) ?? []}
          hoy={hoy}
          puedeEditar={puedeEditar}
          onVolver={() => setMesExpandido(null)}
          onCambiarMes={(m) => setMesExpandido(m)}
        />
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t pt-4">
        {Object.entries(CATS).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2.5 rounded-full', c.dot)} />
            {c.nombre}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><TriangleAlert className="size-3 text-red-500" /> Vencida</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CircleCheck className="size-3 text-emerald-500" /> Cumplida</span>
      </div>
    </div>
  )
}

function Tooltip({ items }: { items: ItemLegal[] }) {
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden w-max max-w-[230px] -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-left text-popover-foreground shadow-md group-hover:block">
      <div className="space-y-1">
        {items.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className={cn('size-2 shrink-0 rounded-full', e.vencida ? 'bg-red-500' : e.cumplida ? 'bg-emerald-500' : cat(e.categoria).dot)} />
            <span className="truncate">{e.nombre}</span>
          </div>
        ))}
      </div>
      <span className="absolute left-1/2 top-full -mt-px size-2 -translate-x-1/2 rotate-45 border-b border-r bg-popover" />
    </div>
  )
}

function MesExpandido({
  anio, mes, items, hoy, puedeEditar, onVolver, onCambiarMes,
}: {
  anio: number; mes: number; items: ItemLegal[]; hoy: Hoy; puedeEditar: boolean
  onVolver: () => void; onCambiarMes: (mes: number) => void
}) {
  const router = useRouter()
  const [completando, setCompletando] = useState<string | null>(null)

  async function completar(id: string) {
    setCompletando(id)
    const res = await completarOcurrencia({ id })
    setCompletando(null)
    if (res.ok) { toast.success('Obligación marcada como cumplida.'); router.refresh() } else toast.error(res.error)
  }

  const porDia = new Map<number, ItemLegal[]>()
  for (const it of items) {
    const arr = porDia.get(it.dia) ?? []
    arr.push(it)
    porDia.set(it.dia, arr)
  }
  const esHoy = (dia: number) => hoy.anio === anio && hoy.mes === mes && hoy.dia === dia

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-4 duration-200">
      <Card>
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
              const evs = porDia.get(dia) ?? []
              const finde = i % 7 >= 5
              const tieneVencida = evs.some((e) => e.vencida)
              return (
                <div
                  key={i}
                  className={cn(
                    'group relative min-h-[76px] rounded-lg border p-1.5 transition-colors',
                    finde && 'bg-muted/30',
                    evs.length > 0 && !tieneVencida && 'border-transparent',
                    evs[0] && !tieneVencida && cat(evs[0].categoria).soft,
                    tieneVencida && 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10',
                    esHoy(dia) && 'ring-2 ring-primary',
                  )}
                >
                  <span className={cn('text-xs font-medium', esHoy(dia) && 'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground')}>{dia}</span>
                  <div className="mt-1 space-y-0.5">
                    {evs.slice(0, 3).map((e, j) => (
                      <div
                        key={j}
                        className={cn(
                          'truncate rounded px-1 py-px text-[10px] font-medium leading-tight',
                          e.vencida ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300' : cat(e.categoria).chip,
                          e.cumplida && 'line-through opacity-60',
                        )}
                        title={e.nombre}
                      >
                        {e.nombre}
                      </div>
                    ))}
                    {evs.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{evs.length - 3} más</div>}
                  </div>
                  {evs.length > 0 && <Tooltip items={evs} />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lista del mes con acción de cumplir */}
      {items.length > 0 && (
        <Card><CardContent className="divide-y p-0">
          {items.sort((a, b) => a.dia - b.dia).map((o) => {
            const C = cat(o.categoria)
            const Icono = C.icono
            return (
              <div key={o.id} className="flex items-center gap-3 p-3">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', C.soft)}>
                  <Icono className={cn('size-4', C.text)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium', o.cumplida && 'line-through opacity-60')}>{o.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {C.nombre} · vence el {o.dia} de {MESES[mes - 1].toLowerCase()}
                    {o.fuente ? ` · ${o.fuente}` : ''}
                  </p>
                </div>
                {o.cumplida ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CircleCheck className="size-4" /> Cumplida</span>
                ) : o.vencida ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><TriangleAlert className="size-4" /> Vencida</span>
                ) : null}
                {puedeEditar && !o.cumplida && (
                  <Button size="sm" variant="ghost" onClick={() => completar(o.id)} disabled={completando === o.id}>
                    {completando === o.id ? <Spinner /> : <CircleCheck className="size-4" />} Cumplida
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}

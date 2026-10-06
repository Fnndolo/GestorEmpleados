'use client'

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Check, ChevronRight, Megaphone, Save, Sparkles, TriangleAlert, UserX, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DOMINGOS_HABITUAL, domingosPorPersona, sugerirReparto, type DiaEspecial, type TurnosPorPersona } from '@/lib/cronograma'
import { cn } from '@/lib/utils'
import { AvatarColaborador } from '@/components/ui-kit'
import { guardarCronogramaMes, previsualizarAvisosCronograma, publicarCronogramaMes } from './acciones'

type Persona = { id: string; nombre: string; corto: string; cargo: string | null; fotoUrl: string | null; trabajaDomingo: boolean | null }
type Vecino = { fecha: string; ids: string[] } | null

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const diaDe = (f: string) => new Date(`${f}T00:00:00Z`)
const cabecera = (f: string) => `${DIAS[diaDe(f).getUTCDay()]} ${diaDe(f).getUTCDate()}`
// Quién NO entra en el reparto sugerido (p. ej. la oficina): se recuerda por sede en este navegador.
const EVENTO_FUERA = 'cronograma-fuera'
function suscribirFuera(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENTO_FUERA, cb)
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(EVENTO_FUERA, cb) }
}

const larga = (f: string) => `${DIAS[diaDe(f).getUTCDay()].toLowerCase()} ${diaDe(f).getUTCDate()} ${MESES[diaDe(f).getUTCMonth()]}`

/**
 * Grilla del cronograma de un mes: una fila por persona y una columna por
 * domingo o festivo. Al lado, gris, el último día del mes anterior y el
 * primero del siguiente (no se editan aquí, pero cuentan para la regla).
 * Una celda que rompería la regla (dos seguidos) se ve bloqueada y explica
 * por qué; quien llega a 3 domingos se marca (trabajo dominical habitual).
 */
export function CronogramaCliente({ filtros, sedeId, mes, nombreMes, especiales, personas, turnos: inicial, antes, despues, publicadoEn, pendientesDeAviso, editable }: {
  /** El mes y las sedes: van en la misma fila que los botones. */
  filtros: ReactNode
  sedeId: string
  mes: string
  nombreMes: string
  especiales: DiaEspecial[]
  personas: Persona[]
  turnos: TurnosPorPersona
  antes: Vecino
  despues: Vecino
  publicadoEn: string | null
  pendientesDeAviso: number
  editable: boolean
}) {
  const router = useRouter()
  const [turnos, setTurnos] = useState<TurnosPorPersona>(inicial)
  const [cambios, setCambios] = useState(false)
  // Texto y no type=number: sin flechas, y se puede borrar para escribir otro
  // número. Vale lo escrito (mínimo 1); al salir del campo se normaliza.
  const [porDiaTexto, setPorDiaTexto] = useState('1')
  const porDia = Math.max(1, Number.parseInt(porDiaTexto, 10) || 1)
  const [ocupado, setOcupado] = useState<'guardar' | 'publicar' | null>(null)
  /** Celular: el día que se está editando. */
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const claveFuera = `cronograma-fuera:${sedeId}`
  const crudoFuera = useSyncExternalStore(suscribirFuera, () => { try { return localStorage.getItem(claveFuera) ?? '' } catch { return '' } }, () => '')
  const fuera = useMemo(() => new Set(crudoFuera ? crudoFuera.split(',') : []), [crudoFuera])
  function alternarFuera(id: string) {
    const s = new Set(fuera)
    if (s.has(id)) s.delete(id); else s.add(id)
    try { localStorage.setItem(claveFuera, [...s].join(',')) } catch { /* sin almacenamiento: solo esta vez */ }
    window.dispatchEvent(new Event(EVENTO_FUERA))
  }

  // La lista de días en orden, con los vecinos de los bordes: de ahí sale la regla.
  const secuencia = useMemo(() => [...(antes ? [antes.fecha] : []), ...especiales.map((d) => d.fecha), ...(despues ? [despues.fecha] : [])], [antes, despues, especiales])
  const trabaja = (id: string, fecha: string) =>
    (turnos[id] ?? []).includes(fecha) || (antes?.fecha === fecha && antes.ids.includes(id)) || (despues?.fecha === fecha && despues.ids.includes(id))

  /** Si poner a esta persona ese día rompe la regla, el día vecino que la rompe. */
  function bloqueo(id: string, fecha: string): string | null {
    const i = secuencia.indexOf(fecha)
    for (const j of [i - 1, i + 1]) if (j >= 0 && j < secuencia.length && trabaja(id, secuencia[j])) return secuencia[j]
    return null
  }

  function alternar(p: Persona, fecha: string) {
    if (!editable) return
    const suyas = turnos[p.id] ?? []
    if (suyas.includes(fecha)) {
      setTurnos({ ...turnos, [p.id]: suyas.filter((f) => f !== fecha) })
    } else {
      const choca = bloqueo(p.id, fecha)
      if (choca) { toast.error(`${p.nombre.split(' ')[0]} trabaja el ${larga(choca)}: no puede el ${larga(fecha)} (nadie trabaja dos domingos/festivos seguidos).`); return }
      setTurnos({ ...turnos, [p.id]: [...suyas, fecha] })
    }
    setCambios(true)
  }

  function sugerir() {
    const hay = Object.values(turnos).some((f) => f.length > 0)
    if (hay && !window.confirm('El reparto sugerido reemplaza lo que hay en la grilla. ¿Seguir?')) return
    const r = sugerirReparto({
      especiales, personas: personas.filter((p) => !fuera.has(p.id)).map((p) => p.id), porDia,
      antes: new Set(antes?.ids ?? []), despues: new Set(despues?.ids ?? []),
    })
    setTurnos(r.turnos)
    setCambios(true)
    if (r.faltan.length) toast.warning(`No alcanza la gente para ${porDia} por día sin repetir seguido: faltan personas el ${r.faltan.map((f) => larga(f.fecha)).join(', ')}.`, { duration: 9000 })
    else toast.success('Reparto sugerido. Revísalo y guarda.')
  }

  async function guardar(): Promise<boolean> {
    setOcupado('guardar')
    const res = await guardarCronogramaMes({ sedeId, mes, turnos })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return false }
    setCambios(false)
    return true
  }

  // Antes de publicar, a quién le llega el aviso y qué dice (con los turnos tal
  // como están en pantalla, aunque no se hayan guardado). No avisa a nadie.
  const [previa, setPrevia] = useState<{ colaboradorId: string; nombre: string; usuarioId: string | null; titulo: string; mensaje: string }[] | null>(null)
  const [cargandoPrevia, setCargandoPrevia] = useState(false)
  async function verPrevia() {
    setCargandoPrevia(true)
    const res = await previsualizarAvisosCronograma({ sedeId, mes, turnos })
    setCargandoPrevia(false)
    if (!res.ok) { toast.error(res.error); return }
    setPrevia(res.datos)
  }

  async function publicar() {
    setPrevia(null)
    if (cambios && !(await guardar())) return
    setOcupado('publicar')
    const res = await publicarCronogramaMes({ sedeId, mes })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(res.datos.avisados ? `Listo: le avisamos a ${res.datos.avisados} persona${res.datos.avisados === 1 ? '' : 's'}.` : 'No había cambios que avisar.')
    router.refresh()
  }

  const domingos = domingosPorPersona(turnos, especiales)
  const porColumna = (f: string) => personas.filter((p) => (turnos[p.id] ?? []).includes(f)).length

  if (personas.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">{filtros}</div>
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <Users className="size-8" /> No hay personas con vínculo laboral activas en esta sede.
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filtros}
        {editable && (
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={porDiaTexto}
                onChange={(e) => setPorDiaTexto(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => setPorDiaTexto(String(porDia))}
                onFocus={(e) => e.target.select()}
                className="h-8 w-12 text-center tabular-nums" aria-label="Personas por día"
              />
              por día
            </span>
            <Button size="sm" variant="outline" onClick={sugerir} disabled={ocupado !== null} title="Sugerir reparto" aria-label="Sugerir reparto" className="max-sm:size-8 max-sm:px-0"><Sparkles className="size-4" /> <span className="max-sm:sr-only">Sugerir</span></Button>
            <Button size="sm" variant="outline" onClick={() => guardar().then((ok) => ok && toast.success('Cronograma guardado.'))} disabled={!cambios || ocupado !== null} title="Guardar" aria-label="Guardar" className="max-sm:size-8 max-sm:px-0">
              {ocupado === 'guardar' ? <Spinner /> : <Save className="size-4" />} <span className="max-sm:sr-only">Guardar</span>
            </Button>
            <Button size="sm" onClick={verPrevia} disabled={ocupado !== null || cargandoPrevia || (!cambios && publicadoEn !== null && pendientesDeAviso === 0)}>
              {ocupado === 'publicar' || cargandoPrevia ? <Spinner /> : <Megaphone className="size-4" />} {publicadoEn ? 'Avisar cambios' : 'Publicar y avisar'}
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {publicadoEn
          ? <>Publicado el {publicadoEn}{pendientesDeAviso > 0 && !cambios ? <> · <span className="font-medium text-amber-700 dark:text-amber-400">{pendientesDeAviso} cambio{pendientesDeAviso === 1 ? '' : 's'} sin avisar</span></> : null}</>
          : 'Sin publicar: nadie ha recibido aviso de este mes.'}
        {cambios && <span className="font-medium text-amber-700 dark:text-amber-400"> · Hay cambios sin guardar</span>}
      </p>

      {/* Celular: una tarjeta por día; se toca para elegir quién trabaja. */}
      <div className="space-y-2 sm:hidden">
        {especiales.map((d) => {
          const quienes = personas.filter((p) => (turnos[p.id] ?? []).includes(d.fecha))
          return (
            <button
              key={d.fecha} type="button" onClick={() => setDiaAbierto(d.fecha)}
              className="w-full rounded-xl border bg-card p-3 text-left transition-colors active:bg-accent"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold first-letter:uppercase">{larga(d.fecha)}</span>
                {d.festivo && <span className="rounded-full bg-amber-500/12 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">Festivo</span>}
                <span className={cn('ml-auto rounded-full px-2 text-xs tabular-nums', quienes.length ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 font-medium text-amber-700 dark:text-amber-400')}>
                  {quienes.length} {quienes.length === 1 ? 'persona' : 'personas'}
                </span>
                {editable && <ChevronRight className="size-4 text-muted-foreground" />}
              </span>
              {quienes.length ? (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {quienes.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs">
                      <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} className="size-5 [&_[data-slot=avatar-fallback]]:text-[8px]" />
                      {p.corto}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-muted-foreground">{editable ? 'Nadie asignado: toca para elegir.' : 'Nadie asignado.'}</span>
              )}
            </button>
          )
        })}

        <details className="rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <Users className="size-4 text-muted-foreground" /> Personas y totales
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform [details[open]_&]:rotate-90" />
          </summary>
          <ul className="divide-y border-t">
            {personas.map((p) => {
              const habitual = (domingos[p.id] ?? 0) >= DOMINGOS_HABITUAL
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  {editable && (
                    <input type="checkbox" checked={!fuera.has(p.id)} onChange={() => alternarFuera(p.id)} className="size-4 shrink-0 accent-foreground" aria-label={`${p.nombre} entra en el reparto sugerido`} />
                  )}
                  <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} className={cn('size-7', fuera.has(p.id) && 'opacity-50')} />
                  <span className={cn('min-w-0 flex-1 truncate text-sm', fuera.has(p.id) && 'text-muted-foreground')}>{p.nombre}</span>
                  <span className={cn('inline-flex items-center gap-1 text-sm tabular-nums', habitual && 'font-medium text-amber-700 dark:text-amber-400')}>
                    {habitual && <TriangleAlert className="size-3.5" />}{(turnos[p.id] ?? []).length}
                  </span>
                </li>
              )
            })}
          </ul>
          {editable && <p className="border-t px-3 py-2 text-xs text-muted-foreground">La casilla dice quién entra en el reparto sugerido.</p>}
        </details>
      </div>

      {previa && (
        <Dialog open onOpenChange={(o) => { if (!o) setPrevia(null) }}>
          <DialogContent className="flex max-h-[85dvh] flex-col">
            <DialogHeader>
              <DialogTitle>{publicadoEn ? 'Avisar cambios' : 'Publicar y avisar'} · {nombreMes}</DialogTitle>
              <DialogDescription>
                {previa.length === 0
                  ? 'Nadie tiene cambios: no se envía ningún aviso.'
                  : `Le llega a ${previa.filter((a) => a.usuarioId).length} persona${previa.filter((a) => a.usuarioId).length === 1 ? '' : 's'}, en la app y en el celular.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="-mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
              {previa.map((a) => (
                <li key={a.colaboradorId} className={cn('rounded-lg border p-2.5', !a.usuarioId && 'opacity-60')}>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {a.usuarioId ? <Bell className="size-3.5 shrink-0 text-muted-foreground" /> : <UserX className="size-3.5 shrink-0 text-amber-600" />}
                    <span className="truncate">{a.nombre}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.mensaje}</p>
                  {!a.usuarioId && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">No tiene usuario en la plataforma: no le llega.</p>}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPrevia(null)}>Cancelar</Button>
              <Button onClick={publicar} disabled={ocupado !== null}>
                {ocupado === 'publicar' ? <Spinner /> : <Megaphone className="size-4" />} {previa.length ? 'Publicar y avisar' : 'Publicar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {diaAbierto && (
        <Dialog open onOpenChange={(o) => { if (!o) setDiaAbierto(null) }}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="first-letter:uppercase">{larga(diaAbierto)}</DialogTitle>
              <DialogDescription>
                {editable ? 'Toca a quienes trabajan ese día. Los que trabajan el domingo o festivo de al lado no se pueden elegir.' : 'Quiénes trabajan ese día.'}
              </DialogDescription>
            </DialogHeader>
            <ul className="-mx-1 space-y-1">
              {personas.map((p) => {
                const marcado = (turnos[p.id] ?? []).includes(diaAbierto)
                const choca = !marcado ? bloqueo(p.id, diaAbierto) : null
                if (!editable && !marcado) return null
                return (
                  <li key={p.id}>
                    <button
                      type="button" disabled={!editable || !!choca} onClick={() => alternar(p, diaAbierto)} aria-pressed={marcado}
                      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', marcado ? 'bg-foreground/5' : 'active:bg-accent', choca && 'opacity-60')}
                    >
                      <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">{choca ? `Trabaja el ${larga(choca)}` : `${(turnos[p.id] ?? []).length} en el mes${p.trabajaDomingo === false ? ' · su horario no incluye domingo' : ''}`}</span>
                      </span>
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-md border', marcado && 'border-foreground bg-foreground text-background', choca && 'border-dashed')}>
                        {marcado && <Check className="size-4" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <DialogFooter><Button onClick={() => setDiaAbierto(null)}>Listo</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card className="py-0 max-sm:hidden"><CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs">
              <th className="sticky left-0 z-10 bg-muted/90 p-2 text-left font-medium backdrop-blur"><span className="max-sm:hidden">{nombreMes}</span><span className="sm:hidden">Persona</span></th>
              {antes && <th className="p-2 text-center font-normal text-muted-foreground/70" title="Último del mes anterior (no se edita aquí)">{larga(antes.fecha)}</th>}
              {especiales.map((d) => (
                <th key={d.fecha} className="px-1 py-2 text-center font-medium sm:p-2">
                  <span className="block">{cabecera(d.fecha)}</span>
                  {d.festivo && <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-400">Festivo</span>}
                </th>
              ))}
              {despues && <th className="p-2 text-center font-normal text-muted-foreground/70" title="Primero del mes siguiente (no se edita aquí)">{larga(despues.fecha)}</th>}
              <th className="p-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const habitual = (domingos[p.id] ?? 0) >= DOMINGOS_HABITUAL
              return (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="sticky left-0 z-10 w-36 max-w-36 bg-card p-1.5 sm:w-auto sm:max-w-64 sm:p-2">
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      {editable && (
                        <input
                          type="checkbox" checked={!fuera.has(p.id)} onChange={() => alternarFuera(p.id)}
                          className="size-3.5 shrink-0 accent-foreground"
                          aria-label={`${p.nombre} entra en el reparto sugerido`} title="Entra en el reparto sugerido"
                        />
                      )}
                      <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} className={cn('max-sm:size-7', fuera.has(p.id) && 'opacity-50')} />
                      <span className="min-w-0">
                        <span className={cn('block font-medium max-sm:text-xs sm:truncate', fuera.has(p.id) && 'text-muted-foreground')} title={p.nombre}>
                          <span className="max-sm:hidden">{p.nombre}</span><span className="block leading-tight sm:hidden">{p.corto.split(' ')[0]}<span className="block font-normal text-muted-foreground">{p.corto.split(' ').slice(1).join(' ')}</span></span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground max-sm:hidden">
                          {p.cargo ?? '—'}{p.trabajaDomingo === false ? ' · su horario no incluye domingo' : ''}
                        </span>
                      </span>
                    </span>
                  </td>
                  {antes && <td className="p-1 text-center">{antes.ids.includes(p.id) && <Check className="mx-auto size-4 text-muted-foreground/60" />}</td>}
                  {especiales.map((d) => {
                    const marcado = (turnos[p.id] ?? []).includes(d.fecha)
                    const choca = !marcado ? bloqueo(p.id, d.fecha) : null
                    return (
                      <td key={d.fecha} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => alternar(p, d.fecha)}
                          disabled={!editable}
                          title={marcado ? `Trabaja el ${larga(d.fecha)}` : choca ? `Trabaja el ${larga(choca)}: no puede este día` : `Asignar el ${larga(d.fecha)}`}
                          aria-label={`${p.nombre} · ${larga(d.fecha)}${marcado ? ' · trabaja' : ''}`}
                          aria-pressed={marcado}
                          className={cn(
                            'mx-auto grid size-9 place-items-center rounded-md border transition-colors sm:size-8',
                            marcado ? 'border-foreground bg-foreground text-background'
                              : choca ? 'cursor-not-allowed border-dashed bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,var(--muted)_4px,var(--muted)_6px)] text-muted-foreground'
                                : 'hover:bg-accent',
                            !editable && 'cursor-default',
                          )}
                        >
                          {marcado && <Check className="size-4" />}
                        </button>
                      </td>
                    )
                  })}
                  {despues && <td className="p-1 text-center">{despues.ids.includes(p.id) && <Check className="mx-auto size-4 text-muted-foreground/60" />}</td>}
                  <td className="p-2 text-center tabular-nums">
                    <span className={cn('inline-flex items-center gap-1', habitual && 'font-medium text-amber-700 dark:text-amber-400')}
                      title={habitual ? `${domingos[p.id]} domingos en el mes: trabajo dominical habitual, le corresponde descanso compensatorio (CST art. 179)` : undefined}>
                      {habitual && <TriangleAlert className="size-3.5" />}
                      {(turnos[p.id] ?? []).length}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 text-xs text-muted-foreground">
              <td className="sticky left-0 z-10 bg-muted/90 p-2 font-medium backdrop-blur"><span className="max-sm:hidden">Personas por día</span><span className="sm:hidden">Por día</span></td>
              {antes && <td />}
              {especiales.map((d) => {
                const n = porColumna(d.fecha)
                return <td key={d.fecha} className={cn('p-2 text-center tabular-nums', n === 0 && 'font-medium text-amber-700 dark:text-amber-400')}>{n}</td>
              })}
              {despues && <td />}
              <td />
            </tr>
          </tfoot>
        </table>
      </CardContent></Card>
      <details className="group text-xs text-muted-foreground">
        <summary className="cursor-pointer list-none font-medium text-foreground/80 [&::-webkit-details-marker]:hidden">¿Cómo funciona el reparto? <span className="text-muted-foreground group-open:hidden">Ver</span></summary>
        <p className="mt-1">{editable && 'La casilla junto a cada nombre dice quién entra en el reparto sugerido (por ejemplo, para dejar por fuera a quien nunca trabaja domingos). '}Nadie puede trabajar dos domingos o festivos seguidos (cuenta también el último del mes anterior y el primero del siguiente). Quien trabaja {DOMINGOS_HABITUAL} o más domingos en el mes queda marcado: es trabajo dominical habitual y le corresponde un día de descanso compensatorio.</p>
      </details>
    </div>
  )
}

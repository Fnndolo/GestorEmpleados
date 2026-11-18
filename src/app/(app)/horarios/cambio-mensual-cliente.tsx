'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarCheck, Search, Undo2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AvatarColaborador, Pill } from '@/components/ui-kit'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { aplicarHorariosMes, marcarRotacionMensual } from './acciones'

type Persona = {
  id: string
  nombre: string
  cargo: string | null
  fotoUrl: string | null
  rota: boolean
  horarioId: string | null
  horario: string | null
  resumen: string | null
  yaCambiado: boolean
  bloqueo: string | null
}
type Plantilla = { id: string; nombre: string; resumen: string }

/** Con pocos horarios se eligen con un toque (botones); con muchos, en una lista. */
const MAX_BOTONES = 5
const TODOS = '__todos__'

/** Los cargos que aparecen en la lista, sin repetir y en orden. */
const cargosDe = (ps: Persona[]) => [...new Set(ps.map((p) => p.cargo).filter((c): c is string => !!c))].sort()

function filtrar(ps: Persona[], buscar: string, cargo: string) {
  const t = buscar.trim().toLowerCase()
  return ps.filter((p) => (cargo === TODOS || p.cargo === cargo) && (!t || p.nombre.toLowerCase().includes(t) || p.cargo?.toLowerCase().includes(t)))
}

function FiltroCargo({ cargos, valor, onChange }: { cargos: string[]; valor: string; onChange: (v: string) => void }) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos los cargos</SelectItem>
        {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function CambioMensualCliente({ filtros, mes, nombreMes, personas, plantillas, editable }: {
  filtros: ReactNode
  mes: string
  nombreMes: string
  personas: Persona[]
  plantillas: Plantilla[]
  editable: boolean
}) {
  const router = useRouter()
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [buscar, setBuscar] = useState('')
  const [comunicar, setComunicar] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [cargo, setCargo] = useState(TODOS)
  const [agregando, setAgregando] = useState(false)

  // Solo quienes se agregaron a la lista de los que rotan cada mes.
  const lista = useMemo(() => personas.filter((p) => p.rota), [personas])
  const visibles = useMemo(() => filtrar(lista, buscar, cargo), [lista, buscar, cargo])

  async function quitar(p: Persona) {
    const res = await marcarRotacionMensual({ colaboradorIds: [p.id], rota: false })
    if (!res.ok) { toast.error(res.error); return }
    setElegidos((x) => { const n = { ...x }; delete n[p.id]; return n })
    toast.success(`${p.nombre} salió de la lista.`)
    router.refresh()
  }

  // Solo cuenta como cambio lo que es distinto del horario que ya tendría ese mes.
  const cambios = Object.entries(elegidos)
    .filter(([id, h]) => personas.find((p) => p.id === id)?.horarioId !== h)
    .map(([colaboradorId, horarioId]) => ({ colaboradorId, horarioId }))

  function elegir(p: Persona, horarioId: string) {
    setErrores((e) => { const n = { ...e }; delete n[p.id]; return n })
    setElegidos((x) => {
      const n = { ...x }
      if (horarioId === p.horarioId || n[p.id] === horarioId) delete n[p.id]
      else n[p.id] = horarioId
      return n
    })
  }

  async function aplicar() {
    setAplicando(true)
    const res = await aplicarHorariosMes({ mes, cambios, enviarComunicacion: comunicar })
    setAplicando(false)
    if (!res.ok) { toast.error(res.error); return }
    const { aplicados, errores: fallos } = res.datos
    if (aplicados) toast.success(`${aplicados} horario${aplicados === 1 ? '' : 's'} programado${aplicados === 1 ? '' : 's'} desde el 1 de ${nombreMes.split(' ')[0].toLowerCase()}${comunicar ? ', con su comunicación' : ''}.`)
    if (fallos.length) toast.error(`${fallos.length} no se pudo${fallos.length === 1 ? '' : 'ieron'} aplicar. Revisa el motivo en cada persona.`)
    setErrores(Object.fromEntries(fallos.map((f) => [f.colaboradorId, f.error])))
    setElegidos((x) => Object.fromEntries(Object.entries(x).filter(([id]) => fallos.some((f) => f.colaboradorId === id))))
    router.refresh()
  }

  const conBotones = plantillas.length <= MAX_BOTONES

  return (
    <div className="space-y-3 pb-20">
      <div className="flex flex-wrap items-center gap-2">{filtros}</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona" className="pl-8" />
        </div>
        <FiltroCargo cargos={cargosDe(lista)} valor={cargo} onChange={setCargo} />
        {editable && (
          <Button variant="outline" onClick={() => setAgregando(true)}><UserPlus className="size-4" /> Agregar personas</Button>
        )}
      </div>

      {plantillas.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Primero crea los horarios en la pestaña Horarios.</CardContent></Card>
      ) : lista.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <UserPlus className="size-8" />
          Aún no hay nadie en la lista. Agrega solo a las personas que cambian de horario cada mes.
        </CardContent></Card>
      ) : visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay personas con ese filtro.</CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {visibles.map((p) => {
            const elegido = elegidos[p.id] ?? p.horarioId
            const cambia = elegidos[p.id] !== undefined
            return (
              <div key={p.id} className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', cambia && 'bg-primary/5')}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.horario ? <>Tendría: <span className="font-medium text-foreground">{p.horario}</span></> : 'Sin horario'}
                      {p.cargo ? ` · ${p.cargo}` : ''}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.yaCambiado && !cambia && <Pill tone="info">Ya programado para este mes</Pill>}
                      {cambia && <Pill tone="info">Cambia a {plantillas.find((x) => x.id === elegidos[p.id])?.nombre}</Pill>}
                      {p.bloqueo && <Pill tone="warn">{p.bloqueo}</Pill>}
                      {errores[p.id] && <Pill tone="bad">{errores[p.id]}</Pill>}
                    </div>
                  </div>
                </div>
                {editable && !p.bloqueo && (
                  <div className="flex items-center gap-1.5 sm:max-w-[60%] sm:justify-end">
                    {conBotones ? (
                      <div className="flex flex-wrap gap-1.5">
                        {plantillas.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            title={h.resumen}
                            onClick={() => elegir(p, h.id)}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs transition-colors',
                              elegido === h.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                            )}
                          >
                            {h.nombre}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Select value={elegido ?? undefined} onValueChange={(v) => elegir(p, v)}>
                        <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Elegir horario…" /></SelectTrigger>
                        <SelectContent>
                          {plantillas.map((h) => <SelectItem key={h.id} value={h.id}>{h.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {cambia && (
                      <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Deshacer" onClick={() => setElegidos((x) => { const n = { ...x }; delete n[p.id]; return n })}>
                        <Undo2 className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
                {editable && (
                  <Button size="icon" variant="ghost" className="size-7 shrink-0 self-end text-muted-foreground sm:self-center" aria-label={`Quitar a ${p.nombre} de la lista`} title="Quitar de la lista" onClick={() => quitar(p)}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {agregando && (
        <DialogAgregar
          personas={personas.filter((p) => !p.rota)}
          onClose={() => setAgregando(false)}
          onDone={() => { setAgregando(false); router.refresh() }}
        />
      )}

      {editable && cambios.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4 md:left-auto md:right-6 md:px-0">
          <Card className="py-0 shadow-lg">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <span className="text-sm font-medium">{cambios.length} cambio{cambios.length === 1 ? '' : 's'} para {nombreMes.toLowerCase()}</span>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={comunicar} onCheckedChange={(v) => setComunicar(v === true)} /> Enviar comunicación
              </label>
              <Button onClick={aplicar} disabled={aplicando} className="ml-auto">
                {aplicando ? <Spinner /> : <CalendarCheck className="size-4" />} Aplicar desde el día 1
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

/** Elegir a quién se agrega a la lista de los que rotan cada mes. */
function DialogAgregar({ personas, onClose, onDone }: { personas: Persona[]; onClose: () => void; onDone: () => void }) {
  const [buscar, setBuscar] = useState('')
  const [cargo, setCargo] = useState(TODOS)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const visibles = filtrar(personas, buscar, cargo)
  const todosMarcados = visibles.length > 0 && visibles.every((p) => marcados.has(p.id))

  function alternar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function alternarVisibles() {
    setMarcados((m) => { const n = new Set(m); for (const p of visibles) if (todosMarcados) n.delete(p.id); else n.add(p.id); return n })
  }
  async function guardar() {
    setGuardando(true)
    const res = await marcarRotacionMensual({ colaboradorIds: [...marcados], rota: true })
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`${marcados.size} persona${marcados.size === 1 ? '' : 's'} agregada${marcados.size === 1 ? '' : 's'}.`)
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar personas</DialogTitle>
          <DialogDescription>Quienes cambian de horario cada mes. Quedan en la lista hasta que los quites.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona" className="pl-8" />
          </div>
          <FiltroCargo cargos={cargosDe(personas)} valor={cargo} onChange={setCargo} />
        </div>
        {visibles.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={todosMarcados} onCheckedChange={alternarVisibles} /> Marcar {cargo === TODOS && !buscar ? 'todos' : 'los que se ven'} ({visibles.length})
          </label>
        )}
        <div className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
          {visibles.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No hay más personas para agregar.</p>
          ) : visibles.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 p-2 hover:bg-accent">
              <Checkbox checked={marcados.has(p.id)} onCheckedChange={() => alternar(p.id)} />
              <AvatarColaborador nombre={p.nombre} fotoUrl={p.fotoUrl} />
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.cargo ?? 'Sin cargo'}</span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || marcados.size === 0}>
            {guardando ? <Spinner /> : <UserPlus className="size-4" />} Agregar{marcados.size ? ` (${marcados.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

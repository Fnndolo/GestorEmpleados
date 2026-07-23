'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ListChecks, Megaphone, PenLine, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { guardarAsistencias, convocarCapacitacion, registrarEvaluacionAsistente } from '../acciones'

type Asistente = { id: string; colaboradorId: string; colaborador: string; evaluacion: number | null }
type Colaborador = { id: string; nombre: string; sede: string }

export function Asistencia({ capacitacionId, asistentes, colaboradores, puedeEditar }: {
  capacitacionId: string
  asistentes: Asistente[]
  colaboradores: Colaborador[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'lista' | 'convocar' | null>(null)
  const [notaDe, setNotaDe] = useState<Asistente | null>(null)

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setModo('convocar')}>
            <Megaphone className="size-4" /> Convocar
          </Button>
          <Button size="sm" onClick={() => setModo('lista')}>
            <ListChecks className="size-4" /> Tomar lista
          </Button>
        </div>
      )}

      {asistentes.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay asistentes. Usa «Convocar» para citar (queda la constancia) y «Tomar lista» el día de la capacitación.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {asistentes.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3">
              <Check className="size-4 shrink-0 text-emerald-600" />
              <p className="min-w-0 flex-1 truncate text-sm">{a.colaborador}</p>
              {a.evaluacion != null && <span className="text-sm tabular-nums text-muted-foreground">Nota: {a.evaluacion}</span>}
              {puedeEditar && (
                <Button size="sm" variant="ghost" onClick={() => setNotaDe(a)}>
                  <PenLine className="size-4" /> {a.evaluacion != null ? 'Editar nota' : 'Calificar'}
                </Button>
              )}
            </div>
          ))}
        </CardContent></Card>
      )}

      {modo && (
        <DialogChecklist
          modo={modo}
          capacitacionId={capacitacionId}
          colaboradores={colaboradores}
          preMarcados={modo === 'lista' ? asistentes.map((a) => a.colaboradorId) : []}
          onClose={() => setModo(null)}
          onDone={() => { setModo(null); router.refresh() }}
        />
      )}
      {notaDe && <DialogNota asistente={notaDe} onClose={() => setNotaDe(null)} onDone={() => { setNotaDe(null); router.refresh() }} />}
    </div>
  )
}

/** Checklist de colaboradores: sirve para convocar y para tomar lista. */
function DialogChecklist({ modo, capacitacionId, colaboradores, preMarcados, onClose, onDone }: {
  modo: 'lista' | 'convocar'
  capacitacionId: string
  colaboradores: Colaborador[]
  preMarcados: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(preMarcados))
  const [busqueda, setBusqueda] = useState('')
  const [g, setG] = useState(false)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? colaboradores.filter((c) => c.nombre.toLowerCase().includes(q) || c.sede.toLowerCase().includes(q)) : colaboradores
  }, [busqueda, colaboradores])

  function alternar(id: string) {
    setMarcados((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((c) => marcados.has(c.id))
  function alternarTodos() {
    setMarcados((prev) => {
      const s = new Set(prev)
      for (const c of visibles) todosVisiblesMarcados ? s.delete(c.id) : s.add(c.id)
      return s
    })
  }

  async function guardar() {
    const ids = [...marcados]
    if (modo === 'convocar' && ids.length === 0) { toast.error('Marca al menos un colaborador.'); return }
    setG(true)
    const res = modo === 'lista'
      ? await guardarAsistencias({ capacitacionId, colaboradorIds: ids })
      : await convocarCapacitacion({ capacitacionId, colaboradorIds: ids })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    if (modo === 'lista') {
      const r = res.datos as { agregados: number; quitados: number; conservadosConNota: number }
      toast.success(`Lista guardada: ${r.agregados} agregado(s), ${r.quitados} quitado(s).${r.conservadosConNota ? ` ${r.conservadosConNota} con nota se conservaron.` : ''}`)
    } else {
      toast.success(`Convocatoria enviada a ${(res.datos as { convocados: number }).convocados} colaborador(es).`)
    }
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88vh] flex-col">
        <DialogHeader>
          <DialogTitle>{modo === 'lista' ? 'Tomar lista de asistencia' : 'Convocar a la capacitación'}</DialogTitle>
          <DialogDescription>
            {modo === 'lista'
              ? 'Marca quiénes asistieron y guarda. Los desmarcados se quitan (salvo los que ya tienen nota).'
              : 'Los marcados recibirán la citación por notificación y correo; queda la constancia de la convocatoria (RIT art. 68.27).'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nombre o sede…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={alternarTodos}>
            {todosVisiblesMarcados ? 'Desmarcar' : 'Marcar'} visibles
          </Button>
        </div>

        <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
          {visibles.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/40">
              <Checkbox checked={marcados.has(c.id)} onCheckedChange={() => alternar(c.id)} />
              <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.sede}</span>
            </label>
          ))}
          {visibles.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Sin resultados.</p>}
        </div>

        <DialogFooter className="items-center">
          <span className="mr-auto text-xs text-muted-foreground">{marcados.size} marcado(s)</span>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>
            {g ? <Spinner /> : modo === 'lista' ? <ListChecks className="size-4" /> : <Megaphone className="size-4" />}
            {modo === 'lista' ? 'Guardar lista' : 'Enviar convocatoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogNota({ asistente, onClose, onDone }: { asistente: Asistente; onClose: () => void; onDone: () => void }) {
  const [nota, setNota] = useState(asistente.evaluacion != null ? String(asistente.evaluacion) : '')
  const [g, setG] = useState(false)

  async function guardar() {
    const n = Number(nota)
    if (nota === '' || Number.isNaN(n) || n < 0 || n > 100) { toast.error('La nota debe estar entre 0 y 100.'); return }
    setG(true)
    const res = await registrarEvaluacionAsistente({ asistenciaId: asistente.id, evaluacion: n })
    setG(false)
    if (res.ok) { toast.success('Nota registrada.'); onDone() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nota de {asistente.colaborador}</DialogTitle>
          <DialogDescription>Evaluación de la capacitación (0 a 100).</DialogDescription>
        </DialogHeader>
        <Input type="number" min={0} max={100} value={nota} onChange={(e) => setNota(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

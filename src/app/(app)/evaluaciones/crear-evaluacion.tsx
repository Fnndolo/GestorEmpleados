'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { crearEvaluacion, editarEvaluacion, eliminarEvaluacion } from './acciones'

export type EvaluacionItem = {
  id: string
  colaboradorId: string
  colaborador: string
  periodo: string
  puntaje: number
  /** ISO (YYYY-MM-DD). */
  fecha: string
  fortalezas: string | null
  oportunidades: string | null
  compromisos: string | null
}

const Req = () => <span className="text-destructive">*</span>

export function CrearEvaluacion() {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva evaluación</Button>
      {abierto && <DialogEvaluacion onClose={() => setAbierto(false)} />}
    </>
  )
}

/** Registrar (sin `inicial`) o editar una evaluación con el mismo formulario. */
export function DialogEvaluacion({ inicial, onClose }: { inicial?: EvaluacionItem; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [f, setF] = useState<Record<string, string>>(inicial
    ? { periodo: inicial.periodo, puntaje: String(inicial.puntaje), fecha: inicial.fecha, fortalezas: inicial.fortalezas ?? '', oportunidades: inicial.oportunidades ?? '', compromisos: inicial.compromisos ?? '' }
    : { periodo: `${new Date().getUTCFullYear()}-S1`, fecha: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (f.puntaje === undefined || f.puntaje === '') { toast.error('Indica el puntaje (0 a 100).'); return }
    const comunes = { colaboradorId, periodo: f.periodo, puntaje: Number(f.puntaje), fecha: f.fecha, fortalezas: f.fortalezas, oportunidades: f.oportunidades, compromisos: f.compromisos }
    setG(true)
    const res = inicial ? await editarEvaluacion({ id: inicial.id, ...comunes }) : await crearEvaluacion(comunes)
    setG(false)
    if (res.ok) { toast.success(inicial ? 'Evaluación actualizada.' : 'Evaluación registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{inicial ? `Editar evaluación · ${inicial.colaborador}` : 'Nueva evaluación de desempeño'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Colaborador <Req /></Label><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Periodo <Req /></Label><Input value={f.periodo} onChange={(e) => set('periodo', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Puntaje <Req /></Label><Input type="number" min={0} max={100} value={f.puntaje ?? ''} onChange={(e) => set('puntaje', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fecha <Req /></Label><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Fortalezas</Label><Textarea rows={2} value={f.fortalezas ?? ''} onChange={(e) => set('fortalezas', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Oportunidades de mejora</Label><Textarea rows={2} value={f.oportunidades ?? ''} onChange={(e) => set('oportunidades', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Compromisos</Label><Textarea rows={2} value={f.compromisos ?? ''} onChange={(e) => set('compromisos', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Lápiz y papelera de una evaluación en la lista. */
export function AccionesEvaluacion({ evaluacion, puedeEditar, puedeEliminar }: { evaluacion: EvaluacionItem; puedeEditar: boolean; puedeEliminar: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function eliminar() {
    setG(true)
    const res = await eliminarEvaluacion({ id: evaluacion.id, motivo })
    setG(false)
    if (res.ok) { toast.success('Anulado.'); setBorrando(false); router.refresh() } else toast.error(res.error)
  }

  if (!puedeEditar && !puedeEliminar) return null
  return (
    <div className="flex shrink-0 items-center">
      {puedeEditar && (
        <Button variant="ghost" size="icon" aria-label="Editar evaluación" title="Editar evaluación" onClick={() => setEditando(true)}>
          <Pencil className="size-4" />
        </Button>
      )}
      {puedeEliminar && (
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar evaluación" title="Eliminar evaluación" onClick={() => setBorrando(true)}>
          <Trash2 className="size-4" />
        </Button>
      )}
      {editando && <DialogEvaluacion inicial={evaluacion} onClose={() => setEditando(false)} />}
      {borrando && (
        <Dialog open onOpenChange={(o) => !o && !g && setBorrando(false)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Eliminar evaluación</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{evaluacion.colaborador} · {evaluacion.periodo} · {evaluacion.puntaje} / 100</p>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-evaluacion">Motivo <Req /></Label>
              <Textarea id="motivo-evaluacion" rows={2} placeholder="¿Por qué se elimina?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBorrando(false)} disabled={g}>Volver</Button>
              <Button variant="destructive" onClick={eliminar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Trash2 className="size-4" />} Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

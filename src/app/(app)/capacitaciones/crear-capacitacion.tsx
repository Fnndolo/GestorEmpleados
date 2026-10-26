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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearCapacitacion, editarCapacitacion, eliminarCapacitacion } from './acciones'

export type CapacitacionItem = {
  id: string
  titulo: string
  tipo: 'INDUCCION' | 'REINDUCCION' | 'FORMACION' | 'SST'
  /** ISO (YYYY-MM-DD). */
  fecha: string
  duracionHoras: number | null
  facilitador: string | null
  descripcion: string | null
}

const Req = () => <span className="text-destructive">*</span>

export function CrearCapacitacion() {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva capacitación</Button>
      {abierto && <DialogCapacitacion onClose={() => setAbierto(false)} />}
    </>
  )
}

/** Crear (sin `inicial`) o editar una capacitación con el mismo formulario. */
export function DialogCapacitacion({ inicial, onClose }: { inicial?: CapacitacionItem; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>(inicial
    ? { titulo: inicial.titulo, tipo: inicial.tipo, fecha: inicial.fecha, duracionHoras: inicial.duracionHoras != null ? String(inicial.duracionHoras) : '', facilitador: inicial.facilitador ?? '', descripcion: inicial.descripcion ?? '' }
    : { tipo: 'FORMACION', fecha: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function guardar() {
    const comunes = { titulo: f.titulo ?? '', tipo: f.tipo as 'FORMACION', fecha: f.fecha, duracionHoras: f.duracionHoras ? Number(f.duracionHoras) : undefined, facilitador: f.facilitador, descripcion: f.descripcion }
    setG(true)
    if (inicial) {
      const res = await editarCapacitacion({ id: inicial.id, ...comunes })
      setG(false)
      if (res.ok) { toast.success('Capacitación actualizada.'); onClose(); router.refresh() } else toast.error(res.error)
      return
    }
    const res = await crearCapacitacion(comunes)
    setG(false)
    if (res.ok) { toast.success('Capacitación creada.'); onClose(); router.push(`/capacitaciones/${res.datos.id}`) } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{inicial ? 'Editar capacitación' : 'Nueva capacitación'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Título <Req /></Label><Input value={f.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tipo <Req /></Label>
              <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="INDUCCION">Inducción</SelectItem><SelectItem value="REINDUCCION">Reinducción</SelectItem><SelectItem value="FORMACION">Formación</SelectItem><SelectItem value="SST">SST</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Fecha <Req /></Label><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Duración (horas)</Label><Input type="number" min={0} step={0.5} value={f.duracionHoras ?? ''} onChange={(e) => set('duracionHoras', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Facilitador</Label><Input value={f.facilitador ?? ''} onChange={(e) => set('facilitador', e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Descripción</Label><Textarea rows={2} value={f.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar' : 'Crear'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Lápiz y papelera de una capacitación (lista y detalle). Al eliminar desde el
 * detalle se vuelve a la lista, porque la página ya no existe.
 */
export function AccionesCapacitacion({ capacitacion, asistentes, puedeEditar, puedeEliminar, volverAlEliminar = false }: {
  capacitacion: CapacitacionItem
  asistentes: number
  puedeEditar: boolean
  puedeEliminar: boolean
  volverAlEliminar?: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function eliminar() {
    setG(true)
    const res = await eliminarCapacitacion({ id: capacitacion.id, motivo })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Anulado.')
    setBorrando(false)
    if (volverAlEliminar) router.push('/capacitaciones'); else router.refresh()
  }

  if (!puedeEditar && !puedeEliminar) return null
  return (
    <div className="flex shrink-0 items-center">
      {puedeEditar && (
        <Button variant="ghost" size="icon" aria-label="Editar capacitación" title="Editar capacitación" onClick={() => setEditando(true)}>
          <Pencil className="size-4" />
        </Button>
      )}
      {puedeEliminar && (
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Eliminar capacitación" title="Eliminar capacitación" onClick={() => setBorrando(true)}>
          <Trash2 className="size-4" />
        </Button>
      )}
      {editando && <DialogCapacitacion inicial={capacitacion} onClose={() => setEditando(false)} />}
      {borrando && (
        <Dialog open onOpenChange={(o) => !o && !g && setBorrando(false)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader><DialogTitle>Eliminar capacitación</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              {capacitacion.titulo} · {asistentes} asistente(s){asistentes > 0 ? ' · se borran sus asistencias y notas' : ''} · también la evidencia adjunta
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-capacitacion">Motivo <Req /></Label>
              <Textarea id="motivo-capacitacion" rows={2} placeholder="¿Por qué se elimina?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { agregarEntregableOps, editarEntregableOps, marcarEntregableOps, eliminarEntregableOps } from '../../ops-acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

export type EntregableItem = {
  id: string
  descripcion: string
  fechaEntrega: string | null // ISO AAAA-MM-DD
  cumplido: boolean
}

export function Entregables({ contratoOpsId, entregables, puedeEditar }: {
  contratoOpsId: string
  entregables: EntregableItem[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')

  const cumplidos = entregables.filter((e) => e.cumplido).length

  function abrirNuevo() {
    setEditando(null)
    setDescripcion('')
    setFecha('')
    setAgregando(true)
  }
  function abrirEdicion(e: EntregableItem) {
    setAgregando(false)
    setEditando(e.id)
    setDescripcion(e.descripcion)
    setFecha(e.fechaEntrega ?? '')
  }
  function cerrar() {
    setAgregando(false)
    setEditando(null)
  }

  async function guardar() {
    setOcupado(true)
    const res = editando
      ? await editarEntregableOps({ id: editando, descripcion, fechaEntrega: fecha })
      : await agregarEntregableOps({ contratoOpsId, descripcion, fechaEntrega: fecha })
    setOcupado(false)
    if (res.ok) {
      toast.success(editando ? 'Entregable actualizado.' : 'Entregable agregado.')
      cerrar()
      router.refresh()
    } else toast.error(res.error)
  }

  async function marcar(e: EntregableItem) {
    const res = await marcarEntregableOps({ id: e.id, cumplido: !e.cumplido })
    if (res.ok) router.refresh()
    else toast.error(res.error)
  }

  async function eliminar(id: string) {
    const res = await eliminarEntregableOps({ id })
    if (res.ok) {
      toast.success('Entregable eliminado.')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">
          Entregables
          {entregables.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{cumplidos} de {entregables.length} cumplidos</span>
          )}
        </h2>
        {puedeEditar && !agregando && (
          <Button type="button" size="sm" variant="outline" onClick={abrirNuevo}><Plus className="size-4" /> Añadir</Button>
        )}
      </div>

      {entregables.length === 0 && !agregando && (
        <p className="text-sm text-muted-foreground">
          Sin entregables registrados. {puedeEditar ? 'Añade los pactados en el contrato para hacerles seguimiento antes de aprobar las cuentas de cobro.' : ''}
        </p>
      )}

      <ul className="space-y-1.5">
        {entregables.map((e) =>
          editando === e.id ? (
            <li key={e.id}><Editor descripcion={descripcion} fecha={fecha} setDescripcion={setDescripcion} setFecha={setFecha} guardar={guardar} cerrar={cerrar} ocupado={ocupado} /></li>
          ) : (
            <li key={e.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              {puedeEditar ? (
                <input
                  type="checkbox"
                  checked={e.cumplido}
                  onChange={() => marcar(e)}
                  className="size-4 shrink-0"
                  aria-label={e.cumplido ? 'Desmarcar cumplido' : 'Marcar cumplido'}
                />
              ) : (
                <Badge variant={e.cumplido ? 'default' : 'secondary'} className="shrink-0">{e.cumplido ? 'Cumplido' : 'Pendiente'}</Badge>
              )}
              <div className="min-w-0 flex-1">
                <span className={e.cumplido ? 'text-muted-foreground line-through' : ''}>{e.descripcion}</span>
                {e.fechaEntrega && <span className="ml-2 text-xs text-muted-foreground">entrega: {e.fechaEntrega}</span>}
              </div>
              {puedeEditar && (
                <div className="flex shrink-0 gap-0.5">
                  <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => abrirEdicion(e)}><Pencil className="size-3.5" /></Button>
                  {!e.cumplido && (
                    <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => eliminar(e.id)}><Trash2 className="size-3.5" /></Button>
                  )}
                </div>
              )}
            </li>
          ),
        )}
        {agregando && <li><Editor descripcion={descripcion} fecha={fecha} setDescripcion={setDescripcion} setFecha={setFecha} guardar={guardar} cerrar={cerrar} ocupado={ocupado} /></li>}
      </ul>
    </div>
  )
}

function Editor({ descripcion, fecha, setDescripcion, setFecha, guardar, cerrar, ocupado }: {
  descripcion: string
  fecha: string
  setDescripcion: (v: string) => void
  setFecha: (v: string) => void
  guardar: () => void
  cerrar: () => void
  ocupado: boolean
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="p. ej. Informe mensual de actividades" spellCheck lang="es" autoFocus />
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label>Fecha de entrega (opcional)</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={cerrar}><X className="size-4" /> Cancelar</Button>
          <Button type="button" size="sm" onClick={guardar} disabled={ocupado || descripcion.trim().length < 3}>
            {ocupado ? <Spinner /> : <Check className="size-4" />} Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}

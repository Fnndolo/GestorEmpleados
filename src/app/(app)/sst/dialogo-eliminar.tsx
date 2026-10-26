'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ResultadoAccion } from '@/server/accion'

/** Lo que una lista guarda en estado para abrir `DialogEliminar` sobre un registro concreto. */
export type Eliminacion = {
  titulo: string
  detalle: string
  nota?: string
  eliminar: (motivo: string) => Promise<ResultadoAccion<unknown>>
  onExito?: (datos: unknown) => void
  exito?: string
  verbo?: string
}

/**
 * Confirmación de anular/eliminar un registro de SST con el motivo
 * obligatorio: el motivo queda en la auditoría junto al borrado. `detalle`
 * resume qué se va a borrar; `nota`, lo que se lleva consigo (soportes,
 * seguimientos, alertas) para que nadie se sorprenda.
 */
export function DialogEliminar<T>({ titulo, detalle, nota, eliminar, onClose, onExito, exito = 'Eliminado.', verbo = 'Eliminar' }: {
  titulo: string
  detalle: string
  nota?: string
  eliminar: (motivo: string) => Promise<ResultadoAccion<T>>
  onClose: () => void
  /** Si se pasa, reemplaza el toast de éxito (p. ej. para avisar algo que dependa de la respuesta). */
  onExito?: (datos: T) => void
  exito?: string
  verbo?: string
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await eliminar(motivo.trim())
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    if (onExito) onExito(res.datos); else toast.success(exito)
    onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{detalle}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="motivo-eliminar-sst">Motivo <span className="text-destructive">*</span></Label>
          <Textarea id="motivo-eliminar-sst" rows={2} placeholder="¿Por qué se elimina?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Volver</Button>
          <Button variant="destructive" onClick={confirmar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Trash2 className="size-4" />} {verbo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Lápiz que abre el diálogo de crear precargado. */
export function BotonEditar({ onClick, etiqueta = 'Editar', className }: { onClick: () => void; etiqueta?: string; className?: string }) {
  return (
    <Button type="button" size="icon" variant="ghost" className={className ?? 'size-8 shrink-0 text-muted-foreground hover:text-foreground'} onClick={onClick} aria-label={etiqueta} title={etiqueta}>
      <Pencil className="size-4" />
    </Button>
  )
}

/**
 * Caneca que abre el diálogo de motivo. Con `bloqueado` el botón se sigue
 * viendo, pero explica por qué no se puede (tooltip y aviso al tocarlo).
 */
export function BotonEliminar({ onClick, etiqueta = 'Eliminar', bloqueado, className }: { onClick: () => void; etiqueta?: string; bloqueado?: string | null; className?: string }) {
  return (
    <Button
      type="button" size="icon" variant="ghost"
      className={className ?? 'size-8 shrink-0 text-destructive hover:text-destructive'}
      aria-label={bloqueado ? `${etiqueta} (bloqueado)` : etiqueta} title={bloqueado ?? etiqueta} aria-disabled={Boolean(bloqueado)}
      onClick={() => (bloqueado ? toast.error(bloqueado) : onClick())}
    >
      <Trash2 className={bloqueado ? 'size-4 opacity-50' : 'size-4'} />
    </Button>
  )
}

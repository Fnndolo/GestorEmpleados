'use client'

import { useState, type ReactNode } from 'react'
import { Ban, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Confirmación de anular o eliminar con el motivo obligatorio (mínimo 5
 * caracteres), igual que en Novedades. El resumen dice qué se va a borrar;
 * quien llama ejecuta la acción en `onConfirmar` y devuelve si salió bien
 * (el diálogo se cierra solo si sí).
 */
export function DialogMotivo({ titulo, resumen, accion = 'eliminar', etiqueta, placeholder = '¿Por qué?', onConfirmar, onClose }: {
  titulo: string
  resumen?: ReactNode
  accion?: 'eliminar' | 'anular'
  /** Texto del botón; por defecto «Eliminar» o «Anular». */
  etiqueta?: string
  placeholder?: string
  onConfirmar: (motivo: string) => Promise<boolean>
  onClose: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)
  const Icono = accion === 'anular' ? Ban : Trash2

  async function confirmar() {
    setG(true)
    const ok = await onConfirmar(motivo.trim())
    setG(false)
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        {resumen && <p className="text-sm text-muted-foreground">{resumen}</p>}
        <Textarea rows={2} placeholder={placeholder} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmar} disabled={g || motivo.trim().length < 5}>
            {g ? <Spinner /> : <Icono className="size-4" />} {etiqueta ?? (accion === 'anular' ? 'Anular' : 'Eliminar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

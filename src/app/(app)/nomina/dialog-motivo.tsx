'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Anular, borrar o deshacer algo de nómina con el motivo obligatorio (queda en
 * auditoría): el resumen del registro, el motivo y el botón rojo. Lo comparten
 * comisiones, horas, conceptos, descuentos y los pagos.
 */
export function DialogMotivo({ titulo, detalle, verbo = 'Anular', icono = 'ban', exito = 'Anulado.', confirmar, onClose, onOk }: {
  titulo: string
  detalle: string
  /** Texto del botón: «Anular», «Borrar», «Deshacer pago»… */
  verbo?: string
  icono?: 'ban' | 'trash'
  exito?: string
  confirmar: (motivo: string) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
  onOk?: () => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)
  const Icono = icono === 'trash' ? Trash2 : Ban

  async function ejecutar() {
    setG(true)
    const res = await confirmar(motivo.trim())
    setG(false)
    if (res.ok) { toast.success(exito); onClose(); onOk?.(); router.refresh() } else toast.error(res.error ?? 'No se pudo completar.')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{detalle}</p>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-nomina">Motivo <span className="text-destructive">*</span></Label>
          <Textarea id="motivo-nomina" rows={2} placeholder="¿Por qué? Queda en la auditoría." value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Volver</Button>
          <Button variant="destructive" onClick={ejecutar} disabled={g || motivo.trim().length < 5}>
            {g ? <Spinner /> : <Icono className="size-4" />} {verbo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

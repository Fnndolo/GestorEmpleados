'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { devolverRenuncia } from './acciones'

/**
 * Devolver una renuncia para que el trabajador la corrija. La renuncia no se
 * niega —es decisión de quien renuncia—: se le dice qué ajustar (la fecha, el
 * preaviso…) y la presenta de nuevo desde su autoservicio.
 */
export function DevolverRenuncia({ renunciaId, nombre }: { renunciaId: string; nombre: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function devolver() {
    setG(true)
    const res = await devolverRenuncia({ renunciaId, motivo })
    setG(false)
    if (res.ok) {
      toast.success('Renuncia devuelta. Le avisamos al trabajador.')
      setAbierto(false)
      setMotivo('')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)} aria-label="Devolver" title="Devolver para corregir">
        <Undo2 className="size-3.5" /> <span className="hidden sm:inline">Devolver</span>
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver la renuncia</DialogTitle>
            <DialogDescription>{nombre} la corrige y la presenta de nuevo desde su autoservicio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-devolucion">Qué debe corregir <span className="text-destructive">*</span></Label>
            <Textarea
              id="motivo-devolucion" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="p. ej. El último día no cumple los 30 días de preaviso del contrato."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={devolver} disabled={g || motivo.trim().length < 5}>{g && <Spinner />}Devolver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { eliminarColaborador } from '../acciones'

/**
 * Eliminar una ficha creada por error. El servidor solo lo permite sin historia
 * (contratos, nóminas, novedades, documentos); si la hay, el mensaje dice qué
 * tiene y remite a cambiar el estado. Con éxito se vuelve a la lista.
 */
export function EliminarColaborador({ colaboradorId, nombre }: { colaboradorId: string; nombre: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [g, setG] = useState(false)

  async function confirmar() {
    setG(true)
    const res = await eliminarColaborador({ id: colaboradorId, motivo })
    setG(false)
    if (!res.ok) { toast.error(res.error, { duration: 10000 }); return }
    toast.success(res.datos.teniaUsuario ? 'Ficha eliminada. Su usuario de acceso quedó sin ficha: desactívalo en Usuarios.' : 'Ficha eliminada.', { duration: 8000 })
    setAbierto(false)
    router.push('/colaboradores')
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAbierto(true)} aria-label="Eliminar ficha" title="Eliminar ficha (solo si se creó por error)">
        <Trash2 className="size-4" /> <span className="hidden sm:inline">Eliminar</span>
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !g && setAbierto(o)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Eliminar la ficha de {nombre}</DialogTitle>
            <DialogDescription>
              Solo si se creó por error (persona duplicada, alta equivocada). Una ficha con contratos, nóminas,
              novedades o documentos no se borra: si la persona se retiró, cambia su estado a Retirado. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-eliminar-colab">Motivo <span className="text-destructive">*</span></Label>
            <Textarea id="motivo-eliminar-colab" rows={2} placeholder="¿Por qué se elimina?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Volver</Button>
            <Button variant="destructive" onClick={confirmar} disabled={g || motivo.trim().length < 5}>{g ? <Spinner /> : <Trash2 className="size-4" />} Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

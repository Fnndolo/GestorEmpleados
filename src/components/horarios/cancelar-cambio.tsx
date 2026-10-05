'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cancelarCambioHorario } from '@/app/(app)/horarios/acciones'

/** Deshace un cambio de horario que todavía no empieza (vuelve a regir el anterior). */
export function CancelarCambio({ asignacionId }: { asignacionId: string }) {
  const router = useRouter()
  const [g, setG] = useState(false)
  async function cancelar() {
    if (!window.confirm('¿Cancelar este cambio de horario? Sigue el que tiene hoy.')) return
    setG(true)
    const res = await cancelarCambioHorario({ asignacionId })
    setG(false)
    if (res.ok) { toast.success('Cambio cancelado.'); router.refresh() } else toast.error(res.error)
  }
  return (
    <Button size="sm" variant="ghost" onClick={cancelar} disabled={g}>{g ? <Spinner /> : <Undo2 className="size-4" />} Cancelar cambio</Button>
  )
}

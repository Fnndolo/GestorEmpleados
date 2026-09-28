'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleCheck, Circle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { cerrarTerminacion } from '../acciones'

/** Paso "Cierre": lo que exige la empresa, con su marca, y el botón que se habilita al tenerlo todo. */
export function CierreTerminacion({ terminacionId, requisitos, cerrada, puedeAprobar }: {
  terminacionId: string
  requisitos: { texto: string; ok: boolean }[]
  cerrada: boolean
  puedeAprobar: boolean
}) {
  const router = useRouter()
  const [g, setG] = useState(false)
  const listo = requisitos.every((r) => r.ok)

  async function cerrar() {
    setG(true)
    const res = await cerrarTerminacion({ id: terminacionId })
    setG(false)
    if (res.ok) { toast.success('Terminación cerrada.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {requisitos.map((r) => (
          <li key={r.texto} className={cn('flex items-center gap-2 text-sm', !r.ok && 'text-muted-foreground')}>
            {r.ok ? <CircleCheck className="size-4 shrink-0 text-emerald-600" /> : <Circle className="size-4 shrink-0" />}
            {r.texto}
          </li>
        ))}
      </ul>
      {cerrada ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"><Lock className="size-4" /> Terminación cerrada.</p>
      ) : puedeAprobar && (
        <Button onClick={cerrar} disabled={!listo || g} className="w-full sm:w-auto">
          {g ? <Spinner /> : <Lock className="size-4" />} Cerrar terminación
        </Button>
      )}
    </div>
  )
}

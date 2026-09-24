'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleCheck, Undo2, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { marcarHistorialVacaciones } from '@/app/(app)/novedades/acciones'

/**
 * Confirmación de Talento Humano de que ya cargó las vacaciones que la persona
 * tomó antes de la plataforma. Hasta entonces el colaborador ve "—" en vez de
 * su saldo en Autoservicio, porque el número podría incluir días ya tomados.
 */
export function HistorialVacaciones({ colaboradorId, completoEn }: { colaboradorId: string; completoEn: string | null }) {
  const router = useRouter()
  const [g, setG] = useState(false)

  async function marcar(completo: boolean) {
    setG(true)
    const res = await marcarHistorialVacaciones({ colaboradorId, completo })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(completo ? 'Listo: el colaborador ya ve su saldo de vacaciones en Autoservicio.' : 'El saldo vuelve a quedar oculto para el colaborador.')
    router.refresh()
  }

  return completoEn ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs">
      <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-4 shrink-0" />
        Historial cargado el {completoEn}: el colaborador ve su saldo en Autoservicio.
      </p>
      <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={g} onClick={() => marcar(false)}>
        {g ? <Spinner /> : <Undo2 className="size-3.5" />} Desmarcar
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <p className="min-w-0 flex-1 text-muted-foreground">
        El colaborador aún no ve su saldo. Registra las vacaciones que ya tomó y luego confirma que el historial está completo.
      </p>
      <Button size="sm" disabled={g} onClick={() => marcar(true)}>
        {g ? <Spinner /> : <ListChecks className="size-4" />} Historial completo
      </Button>
    </div>
  )
}

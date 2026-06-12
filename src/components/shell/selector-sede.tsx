'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cambiarSede } from '@/app/(app)/acciones-sede'
import type { OpcionSede } from '@/server/sede-actual'

export function SelectorSede({
  sedes,
  actual,
}: {
  sedes: OpcionSede[]
  actual: string | null
}) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()

  function onCambio(valor: string) {
    startTransition(async () => {
      await cambiarSede(valor)
      router.refresh()
    })
  }

  return (
    <Select value={actual ?? 'todas'} onValueChange={onCambio} disabled={pendiente}>
      <SelectTrigger className="w-full gap-2" size="sm" aria-label="Seleccionar sede">
        <Building2 className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todas">Todas las sedes</SelectItem>
        {sedes.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nombre} · {s.ciudad}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

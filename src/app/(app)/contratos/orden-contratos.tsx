'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type OrdenContratos = 'nombre' | 'ingreso'

/**
 * Botón (solo icono) para elegir el orden de la lista de contratos. Va por URL
 * (`?orden=`) como las pestañas, así el orden se conserva al recargar o compartir.
 */
export function OrdenContratosMenu({ orden }: { orden: OrdenContratos }) {
  const router = useRouter()
  const params = useSearchParams()

  const elegir = (v: string) => {
    const p = new URLSearchParams(params)
    // Nombre es el orden por defecto: no hace falta dejarlo en la URL.
    if (v === 'nombre') p.delete('orden')
    else p.set('orden', v)
    const q = p.toString()
    router.push(q ? `/contratos?${q}` : '/contratos')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0" aria-label="Ordenar contratos" title="Ordenar">
          <ListFilter className="size-4" />
          {/* Punto discreto cuando no está el orden por defecto. */}
          {orden !== 'nombre' && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={orden} onValueChange={elegir}>
          <DropdownMenuRadioItem value="nombre">Nombre (A–Z)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ingreso">Fecha de ingreso (más reciente)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Papelera de un catálogo, que NO se esconde cuando el borrado está bloqueado.
 *
 * Un botón que desaparece deja al usuario adivinando si le falta un permiso o si
 * la app está fallando. Aquí el botón sigue visible pero inerte, y el tooltip
 * dice exactamente qué lo bloquea ("tiene 2 cargos asignados"), que es la
 * información que necesita para poder desbloquearlo.
 *
 * `motivoBloqueo` en null = se puede eliminar.
 */
export function BotonEliminar({ onEliminar, motivoBloqueo, etiqueta = 'Eliminar' }: {
  onEliminar: () => void
  motivoBloqueo?: string | null
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)

  if (!motivoBloqueo) {
    return (
      <Button type="button" size="icon" variant="ghost" onClick={onEliminar} aria-label={etiqueta}>
        <Trash2 className="size-4" />
      </Button>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip open={abierto} onOpenChange={setAbierto}>
        <TooltipTrigger asChild>
          {/* El <span> recibe el evento: un <button disabled> no dispara hover ni
              clic, así que el tooltip nunca se abriría. */}
          <span
            tabIndex={0}
            role="button"
            aria-disabled
            aria-label={`${etiqueta} (bloqueado)`}
            onClick={() => setAbierto((v) => !v)}
            className="inline-flex size-9 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="max-w-64 leading-relaxed">{motivoBloqueo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

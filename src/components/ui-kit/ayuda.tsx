'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Signo de interrogación con la explicación al pasar el mouse.
 *
 * Sirve para sacar del formulario el texto de apoyo que solo se necesita la
 * primera vez: la pantalla queda limpia y la explicación sigue a un gesto de
 * distancia.
 *
 * Radix abre el tooltip con hover y con foco de teclado, pero NO con un toque:
 * en móvil el usuario tocaría el signo y no pasaría nada. Por eso el estado va
 * controlado y el clic también lo abre.
 */
export function Ayuda({ texto, etiqueta = 'Más información' }: { texto: string; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <TooltipProvider>
      <Tooltip open={abierto} onOpenChange={setAbierto}>
        <TooltipTrigger asChild>
          <button
            // type="button" es obligatorio: dentro de un <form>, un botón sin
            // tipo envía el formulario.
            type="button"
            aria-label={etiqueta}
            onClick={() => setAbierto((v) => !v)}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HelpCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="max-w-64 leading-relaxed">
          {texto}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

'use client'

import type { ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Qué hace un botón de solo ícono, al pasar el mouse. El `title` del navegador
 * tarda y casi no se nota; esto sale enseguida, con el estilo de la app. El
 * botón sigue llevando su aria-label para los lectores de pantalla.
 */
export function Pista({ texto, children, lado = 'top' }: { texto: string; children: ReactElement; lado?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={lado} className="max-w-64 leading-relaxed">{texto}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

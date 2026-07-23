'use client'

import type { ReactNode } from 'react'
import { ChevronRight, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip, Pill, type ChipColor, type PillTone } from '@/components/ui-kit'
import { Card } from '@/components/ui/card'

/** Estado de una sección para la píldora de la derecha del acordeón. */
export type EstadoSeccion =
  | { tono: PillTone; texto: string; auto?: false }
  | { tono: 'muted'; texto: string; auto: true } // prellenado (marca ✨/config)

/**
 * Sección de nivel superior de los formularios de contrato (acordeón). Las
 * "prellenadas" (contratista autocompletado, documento desde la plantilla,
 * empresa desde config) se muestran atenuadas y colapsadas: solo se abren si se
 * quieren revisar. Compartido entre el form OPS y el laboral.
 */
export function Seccion({
  icono, color, titulo, resumen, estado, open, onToggle, prellenada, children,
}: {
  icono: LucideIcon; color: ChipColor; titulo: string; resumen: string
  estado: EstadoSeccion; open: boolean; onToggle: () => void; prellenada?: boolean; children: ReactNode
}) {
  return (
    <Card className={cn('overflow-hidden', open && 'ring-1 ring-primary/25', prellenada && !open && 'bg-muted/40')}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Chip icono={icono} color={color} className={cn('shrink-0', prellenada && !open && 'opacity-80')} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', prellenada && !open && 'font-medium text-muted-foreground')}>{titulo}</p>
          <p className="truncate text-xs text-muted-foreground">{resumen}</p>
        </div>
        <Pill tone={estado.tono}>
          {estado.auto && <Sparkles className="size-3" />}
          {estado.texto}
        </Pill>
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && <div className="border-t p-4">{children}</div>}
    </Card>
  )
}

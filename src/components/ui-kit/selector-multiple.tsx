'use client'

import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type OpcionMultiple = { valor: string; etiqueta: string; detalle?: string }

/**
 * Un select que deja elegir varias opciones: cerrado muestra las elegidas como
 * etiquetas (cada una con su ×), abierto la lista con ✓. Ocupa lo mismo que un
 * select normal en vez de una lista de casillas siempre abierta.
 */
export function SelectorMultiple({ opciones, seleccionados, onChange, vacio = 'Ninguno', id, deshabilitado }: {
  opciones: OpcionMultiple[]
  seleccionados: string[]
  onChange: (valores: string[]) => void
  /** Lo que se lee cuando no hay nada elegido. */
  vacio?: string
  id?: string
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const elegidas = opciones.filter((o) => seleccionados.includes(o.valor))
  const alternar = (v: string) => onChange(seleccionados.includes(v) ? seleccionados.filter((x) => x !== v) : [...seleccionados, v])

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        id={id} type="button" disabled={deshabilitado}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {elegidas.length ? elegidas.map((o) => (
            <span key={o.valor} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pl-2 pr-1 text-xs">
              <span className="truncate">{o.etiqueta}</span>
              <span
                role="button" tabIndex={-1} aria-label={`Quitar ${o.etiqueta}`}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); alternar(o.valor) }}
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" />
              </span>
            </span>
          )) : <span className="px-0.5 text-muted-foreground">{vacio}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-h-64 overflow-y-auto p-1">
        {opciones.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No hay opciones.</p>
        ) : opciones.map((o) => {
          const marcada = seleccionados.includes(o.valor)
          return (
            <button
              key={o.valor} type="button" role="option" aria-selected={marcada} onClick={() => alternar(o.valor)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className={cn('grid size-4 shrink-0 place-items-center rounded border', marcada && 'border-primary bg-primary text-primary-foreground')}>
                {marcada && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
              {o.detalle && <span className="shrink-0 text-xs text-muted-foreground">{o.detalle}</span>}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

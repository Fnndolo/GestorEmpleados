'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaCorta, formatFechaLarga } from '@/lib/fechas'
import type { FaseRuta } from '@/lib/ruta-disciplinaria'
import { SoportesLista } from '@/app/(app)/juridica/_ui'

/**
 * Rastreo del proceso, como el de un envío: cada fase es un nodo unido al
 * siguiente por una línea. Lo cumplido va en tinta con su fecha, la fase en
 * curso lleva el anillo, lo que falta queda en gris.
 *
 * Cada nodo con actuaciones es un sub-acordeón: al tocarlo se despliega LO DE
 * ESA FASE (qué se dijo, con qué soportes) justo debajo de él, en vez de una
 * lista larga al final. En escritorio la fila queda arriba y el panel de la
 * fase elegida se abre debajo de la fila, señalado con una punta bajo su nodo;
 * en el teléfono, en columna, el panel cae directamente bajo el nodo.
 */
export function RutaProceso({ fases, compacta = false }: { fases: FaseRuta[]; compacta?: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const nodo = compacta ? 'size-6' : 'size-8'
  const seleccionada = fases.find((f) => f.clave === abierta && f.actuaciones.length > 0) ?? null

  return (
    <div>
      <ol className={cn('flex flex-col sm:flex-row', compacta ? 'text-xs' : 'text-sm')}>
        {fases.map((f, i) => {
          const ultima = i === fases.length - 1
          const hecha = f.estado === 'hecha'
          const actual = f.estado === 'actual'
          const desplegable = f.actuaciones.length > 0
          const activa = abierta === f.clave && desplegable
          const subtitulo = actual ? 'En curso' : f.fecha ? formatFechaCorta(f.fecha) : hecha ? 'Cumplida' : 'Pendiente'
          return (
            <li key={f.clave} className={cn('relative sm:flex-1', !ultima && 'pb-4 sm:pb-0')}>
              {/* Línea hacia la siguiente fase: en tinta si esta ya se cumplió. */}
              {!ultima && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bg-border',
                    compacta ? 'left-3 top-6 bottom-0 w-0.5 sm:top-3' : 'left-4 top-8 bottom-0 w-0.5 sm:top-4',
                    'sm:left-1/2 sm:bottom-auto sm:h-0.5 sm:w-full',
                    hecha && 'bg-foreground',
                  )}
                />
              )}
              <button
                type="button"
                disabled={!desplegable}
                onClick={() => setAbierta((v) => (v === f.clave ? null : f.clave))}
                aria-expanded={activa}
                className={cn(
                  'relative z-10 flex w-full items-start gap-3 rounded-md text-left sm:flex-col sm:items-center sm:gap-1.5 sm:text-center',
                  desplegable ? 'cursor-pointer' : 'cursor-default',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span
                  className={cn(
                    'grid shrink-0 place-items-center rounded-full border-2 transition-shadow', nodo,
                    hecha && 'border-foreground bg-foreground text-background',
                    actual && 'border-foreground bg-background text-foreground ring-4 ring-foreground/15',
                    f.estado === 'pendiente' && 'border-border bg-card text-muted-foreground',
                    activa && 'shadow-md',
                  )}
                >
                  {hecha
                    ? <Check className={compacta ? 'size-3.5' : 'size-4'} strokeWidth={3} />
                    : <span className={cn('rounded-full', compacta ? 'size-1.5' : 'size-2', actual ? 'bg-foreground' : 'bg-border')} />}
                </span>
                <span className="min-w-0 pt-0.5 sm:pt-0">
                  <span className={cn('flex items-center gap-1 font-semibold leading-tight sm:justify-center', f.estado === 'pendiente' ? 'text-muted-foreground' : 'text-foreground')}>
                    {f.etiqueta}
                    {desplegable && <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', activa && 'rotate-180')} />}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{subtitulo}</span>
                </span>
              </button>

              {/* Teléfono: el panel cae bajo el nodo, dentro de la columna. */}
              {activa && (
                <div className="ml-9 mt-2 sm:hidden">
                  <PanelFase fase={f} />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {/* Escritorio: un solo panel bajo la fila, con la punta bajo el nodo elegido. */}
      {seleccionada && (
        <div className="relative mt-3 hidden sm:block">
          <span
            aria-hidden
            className="absolute -top-1.5 size-3 rotate-45 border-l border-t bg-muted/40"
            style={{ left: `calc(${((fases.findIndex((f) => f.clave === seleccionada.clave) + 0.5) / fases.length) * 100}% - 6px)` }}
          />
          <PanelFase fase={seleccionada} />
        </div>
      )}
    </div>
  )
}

/** Lo actuado en una fase: cada actuación con su fecha, su texto y sus soportes. */
function PanelFase({ fase }: { fase: FaseRuta }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <ol className="space-y-3">
        {fase.actuaciones.map((a) => (
          <li key={a.id}>
            <p className="text-xs font-medium text-muted-foreground">{formatFechaLarga(a.fecha)}</p>
            {a.detalle && <p className="mt-0.5 whitespace-pre-wrap">{a.detalle}</p>}
            <SoportesLista documentos={a.soportes} />
          </li>
        ))}
      </ol>
    </div>
  )
}

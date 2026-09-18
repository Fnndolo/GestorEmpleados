import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaCorta } from '@/lib/fechas'
import type { FaseRuta } from '@/lib/ruta-disciplinaria'

/**
 * Rastreo del proceso, como el de un envío: cada fase es un nodo unido al
 * siguiente por una línea. Lo cumplido va en tinta con su fecha, la fase en
 * curso lleva el anillo, lo que falta queda en gris. En escritorio es una
 * fila con la línea entre nodos; en el teléfono se apila en columna con la
 * línea a la izquierda.
 *
 * Sin hooks: sirve en Server Components (Jurídica) y dentro de los de cliente
 * (autoservicio).
 */
export function RutaProceso({ fases, compacta = false }: { fases: FaseRuta[]; compacta?: boolean }) {
  const nodo = compacta ? 'size-6' : 'size-8'
  return (
    <ol className={cn('flex flex-col sm:flex-row', compacta ? 'text-xs' : 'text-sm')}>
      {fases.map((f, i) => {
        const ultima = i === fases.length - 1
        const hecha = f.estado === 'hecha'
        const actual = f.estado === 'actual'
        const subtitulo = actual ? 'En curso' : f.fecha ? formatFechaCorta(f.fecha) : hecha ? 'Cumplida' : 'Pendiente'
        return (
          <li key={f.clave} className={cn('relative flex gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center', !ultima && 'pb-5 sm:pb-0')}>
            {/* Línea hacia la siguiente fase: en tinta si esta ya se cumplió. */}
            {!ultima && (
              <span
                aria-hidden
                className={cn(
                  'absolute bg-border',
                  // Columna: del borde inferior del nodo hasta el siguiente. Fila: del centro de este nodo al del siguiente.
                  compacta ? 'left-3 top-6 bottom-0 w-0.5 sm:top-3' : 'left-4 top-8 bottom-0 w-0.5 sm:top-4',
                  'sm:left-1/2 sm:bottom-auto sm:h-0.5 sm:w-full',
                  hecha && 'bg-foreground',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 grid shrink-0 place-items-center rounded-full border-2', nodo,
                hecha && 'border-foreground bg-foreground text-background',
                actual && 'border-foreground bg-background text-foreground ring-4 ring-foreground/15',
                f.estado === 'pendiente' && 'border-border bg-card text-muted-foreground',
              )}
              aria-label={`${f.etiqueta}: ${subtitulo}`}
            >
              {hecha
                ? <Check className={compacta ? 'size-3.5' : 'size-4'} strokeWidth={3} />
                : <span className={cn('rounded-full', compacta ? 'size-1.5' : 'size-2', actual ? 'bg-foreground' : 'bg-border')} />}
            </span>
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <p className={cn('font-semibold leading-tight', f.estado === 'pendiente' ? 'text-muted-foreground' : 'text-foreground')}>{f.etiqueta}</p>
              <p className="text-[11px] text-muted-foreground">{subtitulo}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

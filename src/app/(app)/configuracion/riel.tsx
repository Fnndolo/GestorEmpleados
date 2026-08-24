'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { GRUPOS, estaVacio, type Contadores } from './secciones'

/**
 * Menú lateral de Configuración. Vive en el layout, así que al cambiar de
 * sección Next solo vuelve a pintar el panel de la derecha: el menú no
 * parpadea ni pierde su posición.
 *
 * Son enlaces reales, no botones: cada sección tiene su URL propia, se puede
 * compartir, abrir en otra pestaña y el botón Atrás funciona solo.
 */
export function RielConfiguracion({ hrefsVisibles, contadores }: {
  /** Secciones que el usuario puede ver, según sus permisos. */
  hrefsVisibles: string[]
  contadores: Contadores
}) {
  const ruta = usePathname()
  const visible = new Set(hrefsVisibles)

  return (
    <nav
      aria-label="Secciones de configuración"
      className={cn(
        '-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1',
        // En escritorio el menú tiene su propio desplazamiento: la rueda mueve
        // solo aquello sobre lo que está el puntero.
        'lg:mx-0 lg:min-h-0 lg:flex-col lg:gap-px lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:pb-4 lg:pr-2',
      )}
    >
      {GRUPOS.map((g) => {
        const secciones = g.secciones.filter((s) => visible.has(s.href))
        if (secciones.length === 0) return null
        return (
          <div key={g.titulo} className="contents lg:block">
            <p className="hidden px-3 pt-3.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0 lg:block">
              {g.titulo}
            </p>
            {secciones.map((s) => {
              // startsWith y no igualdad: las secciones con rutas hijas —el
              // editor de una plantilla, las pestañas de plantillas— deben
              // seguir marcando su entrada en el menú.
              const activo = ruta === s.href || ruta.startsWith(`${s.href}/`)
              const vacio = estaVacio(s.contador, contadores)
              const cuenta = s.contador ? contadores[s.contador] : null
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] transition-colors lg:w-full',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    // En móvil son pastillas sueltas; en escritorio, filas de menú.
                    'border bg-card lg:border-0 lg:bg-transparent',
                    activo
                      ? 'border-primary font-semibold text-foreground lg:bg-card lg:shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  {activo && (
                    <span aria-hidden className="absolute left-0 top-1/2 hidden h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary lg:block" />
                  )}
                  <s.icono className={cn('hidden size-[18px] shrink-0 lg:block', activo ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1 truncate text-left">{s.titulo}</span>
                  {/* Sin puntos de color: el número basta. Un catálogo
                      imprescindible en cero se marca resaltando ese cero. */}
                  {cuenta != null && (
                    <span className={cn('hidden text-[11px] tabular-nums lg:block', vacio ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground/70')}>
                      {cuenta}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

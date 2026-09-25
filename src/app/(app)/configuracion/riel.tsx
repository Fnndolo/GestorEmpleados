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
 *
 * En escritorio se ve igual que el menú general de la app (`NavLinks`): mismos
 * rótulos de grupo, mismas filas y el mismo resaltado de la sección activa,
 * para que Ajustes no parezca otra aplicación. En móvil son pastillas en una
 * fila desplazable.
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
        'lg:relative lg:mx-0 lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:pb-4 lg:pr-2',
      )}
    >
      {GRUPOS.map((g) => {
        const secciones = g.secciones.filter((s) => visible.has(s.href))
        if (secciones.length === 0) return null
        return (
          <div key={g.titulo} className="contents lg:block">
            <p className="mb-1.5 hidden px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
              {g.titulo}
            </p>
            <ul className="contents lg:block lg:space-y-0.5">
              {secciones.map((s) => {
                // startsWith y no igualdad: las secciones con rutas hijas —el
                // editor de una plantilla, las pestañas de plantillas— deben
                // seguir marcando su entrada en el menú.
                const activo = ruta === s.href || ruta.startsWith(`${s.href}/`)
                const vacio = estaVacio(s.contador, contadores)
                const cuenta = s.contador ? contadores[s.contador] : null
                return (
                  <li key={s.href} className="contents lg:block">
                    <Link
                      href={s.href}
                      aria-current={activo ? 'page' : undefined}
                      className={cn(
                        'flex shrink-0 items-center gap-3 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors lg:w-full',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        // En móvil son pastillas sueltas; en escritorio, filas de menú.
                        'rounded-full border bg-card lg:rounded-md lg:border-0 lg:bg-transparent',
                        activo
                          ? 'border-foreground bg-foreground text-background lg:bg-primary/10 lg:text-primary'
                          : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <s.icono className="hidden size-4 shrink-0 lg:block" />
                      <span className="min-w-0 flex-1 truncate text-left">{s.titulo}</span>
                      {/* El número del catálogo, con la forma de las insignias
                          del menú general. Un catálogo imprescindible en cero
                          se marca resaltando ese cero. */}
                      {cuenta != null && (
                        <span
                          className={cn(
                            'ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums lg:block',
                            vacio
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                              : activo ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {cuenta}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

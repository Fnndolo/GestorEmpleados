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
      className="flex gap-1.5 overflow-x-auto rounded-xl border bg-card p-2 lg:sticky lg:top-4 lg:flex-col lg:gap-0.5 lg:overflow-visible"
    >
      {GRUPOS.map((g) => {
        const secciones = g.secciones.filter((s) => visible.has(s.href))
        if (secciones.length === 0) return null
        return (
          <div key={g.titulo} className="contents lg:block">
            <p className="hidden px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1 lg:block">
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
                    'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] transition-colors lg:w-full',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    activo ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <s.icono className="hidden size-4 shrink-0 lg:block" />
                  <span className="min-w-0 flex-1 truncate text-left">{s.titulo}</span>
                  {/* Punto ámbar: catálogo vacío que hace falta para operar. */}
                  {vacio ? (
                    <span className="hidden size-1.5 shrink-0 rounded-full bg-amber-500 lg:block" title="Sin configurar" />
                  ) : cuenta != null && cuenta > 0 ? (
                    <span className="hidden text-[11px] tabular-nums text-muted-foreground/70 lg:block">{cuenta}</span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

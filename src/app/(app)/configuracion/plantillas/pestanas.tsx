'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Pestañas de "Plantillas de documentos". Todo lo que define cómo se ven y qué
 * dicen los documentos que emite la empresa vive en una sola pantalla: antes
 * estaba repartido en tres secciones distintas del menú, con dos de ellas
 * llamadas "Plantillas".
 */
const PESTANAS = [
  { href: '/configuracion/plantillas/membrete', nombre: 'Papel membretado' },
  { href: '/configuracion/plantillas/contratos', nombre: 'Contratos' },
  { href: '/configuracion/plantillas/cuentas-cobro', nombre: 'Cuentas de cobro' },
]

export function PestanasPlantillas() {
  const ruta = usePathname()

  return (
    // Scroll horizontal en móvil: tres pestañas no caben en pantallas angostas.
    <div className="-mx-1 mb-4 overflow-x-auto px-1">
      <nav className="inline-flex gap-1 rounded-lg bg-muted p-1" aria-label="Secciones de plantillas">
        {PESTANAS.map((p) => {
          // startsWith y no igualdad: el editor de una plantilla concreta
          // (…/contratos/abc) debe seguir marcando su pestaña.
          const activa = ruta === p.href || ruta.startsWith(`${p.href}/`)
          return (
            <Link
              key={p.href}
              href={p.href}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                activa ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.nombre}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

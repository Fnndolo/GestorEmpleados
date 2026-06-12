'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filtrarSecciones } from '@/lib/navegacion'

export function NavLinks({
  hrefsVisibles,
  onNavegar,
}: {
  hrefsVisibles: string[]
  onNavegar?: () => void
}) {
  const pathname = usePathname()
  const secciones = filtrarSecciones(hrefsVisibles)

  return (
    <nav className="flex flex-col gap-5">
      {secciones.map((seccion) => (
        <div key={seccion.titulo}>
          <p className="px-3 mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {seccion.titulo}
          </p>
          <ul className="space-y-0.5">
            {seccion.items.map((item) => {
              const activo = pathname === item.href || pathname.startsWith(item.href + '/')
              const Icono = item.icono
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavegar}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      activo
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icono className="size-4 shrink-0" />
                    {item.titulo}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { filtrarSecciones } from '@/lib/navegacion'

export type ModuloCustom = { slug: string; nombre: string }

export function NavLinks({
  hrefsVisibles,
  modulosCustom = [],
  badges,
  onNavegar,
}: {
  hrefsVisibles: string[]
  modulosCustom?: ModuloCustom[]
  badges?: Record<string, number>
  onNavegar?: () => void
}) {
  const pathname = usePathname()
  const secciones = filtrarSecciones(hrefsVisibles)

  // Con rutas anidadas visibles (p. ej. /autoservicio y /autoservicio/aprobaciones)
  // solo se resalta la coincidencia más específica.
  const hrefActivo = secciones
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="flex flex-col gap-5">
      {secciones.map((seccion) => (
        <div key={seccion.titulo}>
          <p className="px-3 mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {seccion.titulo}
          </p>
          <ul className="space-y-0.5">
            {seccion.items.map((item) => {
              const activo = item.href === hrefActivo
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
                    {(badges?.[item.href] ?? 0) > 0 && (
                      <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-primary-foreground">
                        {badges![item.href] > 99 ? '99+' : badges![item.href]}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {modulosCustom.length > 0 && (
        <div>
          <p className="px-3 mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Personalizados</p>
          <ul className="space-y-0.5">
            {modulosCustom.map((m) => {
              const href = `/modulos/${m.slug}`
              const activo = pathname === href
              return (
                <li key={m.slug}>
                  <Link
                    href={href}
                    onClick={onNavegar}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      activo ? 'bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Layers className="size-4 shrink-0" />
                    {m.nombre}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </nav>
  )
}

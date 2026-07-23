'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filtrarItemsMovil } from '@/lib/navegacion'

export function BottomNav({ hrefsVisibles, badges }: { hrefsVisibles: string[]; badges?: Record<string, number> }) {
  const pathname = usePathname()
  const items = filtrarItemsMovil(hrefsVisibles)
  if (items.length === 0) return null

  // Solo se resalta la coincidencia más específica (Autoservicio vs Aprobaciones).
  const hrefActivo = items
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => {
          const activo = item.href === hrefActivo
          const Icono = item.icono
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  activo ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Icono className="size-5" />
                  {(badges?.[item.href] ?? 0) > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 tabular-nums text-primary-foreground">
                      {badges![item.href] > 99 ? '99+' : badges![item.href]}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[64px]">{item.titulo}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

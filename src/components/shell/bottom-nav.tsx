'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filtrarItemsMovil } from '@/lib/navegacion'

export function BottomNav({ hrefsVisibles }: { hrefsVisibles: string[] }) {
  const pathname = usePathname()
  const items = filtrarItemsMovil(hrefsVisibles)
  if (items.length === 0) return null

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => {
          const activo = pathname === item.href || pathname.startsWith(item.href + '/')
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
                <Icono className="size-5" />
                <span className="truncate max-w-[64px]">{item.titulo}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

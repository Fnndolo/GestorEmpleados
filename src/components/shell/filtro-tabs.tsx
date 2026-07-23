'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type FiltroTab = { valor: string; label: string; conteo?: number }

/**
 * Filtro por pestañas responsive: en móvil se muestra como un desplegable (sin
 * scroll horizontal) y en escritorio como pestañas tipo pastilla. Navega por URL
 * (`basePath?paramName=valor`), como las listas que ya usaban enlaces.
 */
export function FiltroTabs({
  tabs,
  activo,
  basePath,
  paramName = 'tab',
}: {
  tabs: FiltroTab[]
  activo: string
  basePath: string
  paramName?: string
}) {
  const router = useRouter()
  const href = (valor: string) => `${basePath}?${paramName}=${valor}`

  return (
    <>
      {/* Móvil: desplegable */}
      <div className="sm:hidden">
        <Select value={activo} onValueChange={(v) => router.push(href(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((t) => (
              <SelectItem key={t.valor} value={t.valor}>
                {t.label}
                {t.conteo != null ? ` (${t.conteo})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Escritorio: pestañas */}
      <div className="hidden gap-1.5 overflow-x-auto pb-1 sm:flex">
        {tabs.map((t) => (
          <Link
            key={t.valor}
            href={href(t.valor)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              activo === t.valor ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {t.label}
            {t.conteo != null && (
              <span className={cn('rounded-full px-1.5 text-xs', activo === t.valor ? 'bg-primary-foreground/20' : 'bg-background')}>
                {t.conteo}
              </span>
            )}
          </Link>
        ))}
      </div>
    </>
  )
}

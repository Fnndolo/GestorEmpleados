import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Kit visual compartido de la app: chips de color por categoría, píldoras de
 * estado, stats con ícono y bloques de datos. El color distingue, no decora —
 * usar siempre el mismo color para la misma categoría en toda la app.
 *
 * Server-safe: sin hooks; se puede usar en Server y Client Components.
 */

/** Paleta de chips (fondo suave al 12% + texto del color). */
export const CHIP = {
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  indigo: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  teal: 'bg-teal-500/12 text-teal-600 dark:text-teal-400',
  ink: 'bg-foreground/8 text-foreground',
} as const
export type ChipColor = keyof typeof CHIP

/** Ícono en caja redondeada con color de categoría. */
export function Chip({ icono: Icono, color, className, iconClassName }: {
  icono: LucideIcon; color: ChipColor | string; className?: string; iconClassName?: string
}) {
  const clase = color in CHIP ? CHIP[color as ChipColor] : color
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', clase, className)}>
      <Icono className={cn('size-4', iconClassName)} />
    </span>
  )
}

/** Clases de píldora por semántica de estado (verde=bien, ámbar=en curso, rosa=mal, neutro=cerrado). */
export const PILL = {
  ok: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  warn: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  bad: 'bg-rose-500/12 text-rose-700 dark:text-rose-400',
  muted: 'bg-foreground/8 text-muted-foreground',
  accent: 'bg-violet-500/12 text-violet-700 dark:text-violet-400',
} as const
export type PillTone = keyof typeof PILL

/** Píldora de estado, legible por color. */
export function Pill({ tone, className, children }: {
  tone: PillTone; className?: string; children: React.ReactNode
}) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', PILL[tone], className)}>
      {children}
    </span>
  )
}

/** Stat de dato clave: chip + cifra + etiqueta (fila de "de un vistazo"). */
export function Stat({ icono, color, valor, label, href, onClick, className }: {
  icono: LucideIcon; color: ChipColor | string; valor: string | number; label: string
  href?: string
  /** Alternativa a `href` cuando la cifra cambia de panel sin salir de la pantalla. */
  onClick?: () => void
  className?: string
}) {
  const contenido = (
    <>
      <Chip icono={icono} color={color} className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight tracking-tight tabular-nums sm:text-[17px]">{valor}</p>
        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground sm:text-[11px]">{label}</p>
      </div>
    </>
  )
  const clases = cn('flex items-center gap-3 rounded-xl border bg-card p-3', className)
  const clasesInteractivo = cn(clases, 'w-full text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')
  if (href) return <Link href={href} className={clasesInteractivo}>{contenido}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clasesInteractivo}>{contenido}</button>
  return <div className={clases}>{contenido}</div>
}

/** Bloque de pares etiqueta → valor con cabecera de chip (fichas, resúmenes). */
export function BloqueDatos({ titulo, icono, color, nota, datos, className }: {
  titulo: string; icono: LucideIcon; color: ChipColor | string; nota?: string
  datos: [string, React.ReactNode][]; className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="py-4">
        <div className="mb-3 flex items-center gap-2.5">
          <Chip icono={icono} color={color} />
          <h3 className="text-sm font-bold">{titulo}</h3>
          {nota && <span className="ml-auto text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">{nota}</span>}
        </div>
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {datos.map(([k, val]) => (
            <div key={k} className="flex min-w-0 flex-col">
              <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-sm">{val}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

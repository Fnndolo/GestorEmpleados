'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * El botón estándar para crear algo: un + sin texto, igual en todas las
 * pantallas. Lo que hace va en `etiqueta`: se ve al pasar el mouse (title) y
 * lo leen los lectores de pantalla. Con `href` es un enlace; si no, un botón.
 */
export function BotonAgregar({ etiqueta, onClick, href, disabled, className }: {
  etiqueta: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  className?: string
}) {
  const clases = cn('size-8 shrink-0 px-0', className)
  if (href) {
    return (
      <Link href={href} scroll={false} aria-label={etiqueta} title={etiqueta} className={cn(buttonVariants({ size: 'sm' }), clases)}>
        <Plus className="size-4" />
      </Link>
    )
  }
  return (
    <Button type="button" size="sm" onClick={onClick} disabled={disabled} aria-label={etiqueta} title={etiqueta} className={clases}>
      <Plus className="size-4" />
    </Button>
  )
}

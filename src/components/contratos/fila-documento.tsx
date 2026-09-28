import { Eye, type LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'

/**
 * Una fila de la lista de documentos del contrato: ícono, qué es, en qué va y
 * sus acciones a la derecha (el ojito abre el documento en el visor, como en el
 * resto de la app). Sirve igual en el servidor y en el cliente.
 */
export function FilaDocumento({ icono: Icono, titulo, sub, tono, children }: {
  icono: LucideIcon
  titulo: string
  sub?: React.ReactNode
  /** Color del estado en `sub`: verde si ya está, ámbar si falta algo. */
  tono?: 'ok' | 'pendiente'
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icono className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{titulo}</p>
        {sub && (
          <p className={cn('truncate text-xs', tono === 'ok' ? 'text-emerald-600' : tono === 'pendiente' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {sub}
          </p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </li>
  )
}

/** El ojito: abre el documento en el visor emergente. */
export function VerDocumento({ documentoId, titulo }: { documentoId: string; titulo: string }) {
  return (
    <VisorPdf documentoId={documentoId} titulo={titulo} className={cn(buttonVariants({ size: 'icon', variant: 'outline' }), 'size-8')}>
      <Eye className="size-4" />
      <span className="sr-only">Ver {titulo}</span>
    </VisorPdf>
  )
}

import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo de Smart Gadgets. La imagen ya incluye el nombre de la marca; en modo
 * completo se añade la línea "Gestión Humana" como bajada.
 */
export function Logo({ claro = false, compacto = false }: { claro?: boolean; compacto?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo-sg.png"
        alt="Smart Gadgets"
        width={131}
        height={72}
        priority
        className={cn('w-auto object-contain', compacto ? 'h-7' : 'h-9')}
      />
      {!compacto && (
        <span className={cn('text-xs', claro ? 'text-slate-300' : 'text-muted-foreground')}>
          Gestión Humana
        </span>
      )}
    </div>
  )
}

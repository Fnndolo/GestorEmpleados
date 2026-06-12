import { Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ claro = false, compacto = false }: { claro?: boolean; compacto?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          'flex size-9 items-center justify-center rounded-xl shadow-sm',
          claro ? 'bg-white/15 text-white' : 'bg-primary text-primary-foreground',
        )}
      >
        <Smartphone className="size-5" />
      </div>
      {!compacto && (
        <div className="leading-tight">
          <p className={cn('font-semibold tracking-tight', claro ? 'text-white' : 'text-foreground')}>
            Smart Gadgets
          </p>
          <p className={cn('text-xs', claro ? 'text-slate-300' : 'text-muted-foreground')}>
            Gestión Humana
          </p>
        </div>
      )}
    </div>
  )
}

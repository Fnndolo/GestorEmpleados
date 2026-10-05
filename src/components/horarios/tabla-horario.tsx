import { NOMBRE_DIA, ORDEN_DIAS, textoFranja, type DiasHorario } from '@/lib/horarios'
import { cn } from '@/lib/utils'

/** Un horario día por día, de lunes a domingo; los días sin franja dicen "Descanso". */
export function TablaHorario({ dias, className }: { dias: DiasHorario; className?: string }) {
  return (
    <dl className={cn('divide-y rounded-lg border text-sm', className)}>
      {ORDEN_DIAS.map((d) => {
        const f = dias[d]
        return (
          <div key={d} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <dt className="text-muted-foreground">{NOMBRE_DIA[d]}</dt>
            <dd className={cn('text-right tabular-nums', f ? 'font-medium' : 'text-muted-foreground')}>{f ? textoFranja(f) : 'Descanso'}</dd>
          </div>
        )
      })}
    </dl>
  )
}

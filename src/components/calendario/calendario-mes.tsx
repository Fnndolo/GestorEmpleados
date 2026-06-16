import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { EventoDia } from '@/server/consultas/eventos-colaborador'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export const COLOR_EVENTO: Record<string, { punto: string; nombre: string }> = {
  vacaciones: { punto: 'bg-emerald-500', nombre: 'Vacaciones' },
  permiso: { punto: 'bg-blue-500', nombre: 'Permiso' },
  dia_familia: { punto: 'bg-purple-500', nombre: 'Día de la familia' },
  compensatorio: { punto: 'bg-teal-500', nombre: 'Día compensatorio' },
  licencia: { punto: 'bg-amber-500', nombre: 'Licencia' },
  incapacidad: { punto: 'bg-red-500', nombre: 'Incapacidad' },
  suspension: { punto: 'bg-slate-500', nombre: 'Suspensión' },
}

export function CalendarioMes({
  anio, mes, eventos, baseHref,
}: {
  anio: number; mes: number; eventos: EventoDia[]; baseHref: string
}) {
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1))
  const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  // getUTCDay: 0=domingo … 6=sábado. Queremos lunes=0
  const offset = (primerDia.getUTCDay() + 6) % 7

  const porDia = new Map<number, EventoDia[]>()
  for (const e of eventos) {
    const arr = porDia.get(e.dia) ?? []
    arr.push(e)
    porDia.set(e.dia, arr)
  }

  const mesAnterior = mes === 1 ? { a: anio - 1, m: 12 } : { a: anio, m: mes - 1 }
  const mesSiguiente = mes === 12 ? { a: anio + 1, m: 1 } : { a: anio, m: mes + 1 }
  const tiposPresentes = [...new Set(eventos.map((e) => e.tipo))]

  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)]
  while (celdas.length % 7 !== 0) celdas.push(null)

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-4">
          <Link href={`${baseHref}?mes=${mesAnterior.a}-${String(mesAnterior.m).padStart(2, '0')}`} className="rounded-md p-1.5 hover:bg-accent"><ChevronLeft className="size-5" /></Link>
          <h2 className="font-semibold">{MESES[mes - 1]} {anio}</h2>
          <Link href={`${baseHref}?mes=${mesSiguiente.a}-${String(mesSiguiente.m).padStart(2, '0')}`} className="rounded-md p-1.5 hover:bg-accent"><ChevronRight className="size-5" /></Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS.map((d, i) => <div key={i} className="text-xs font-medium text-muted-foreground py-1">{d}</div>)}
          {celdas.map((dia, i) => {
            if (dia === null) return <div key={i} />
            const evs = porDia.get(dia) ?? []
            return (
              <div key={i} className={cn('aspect-square rounded-lg border p-1 flex flex-col', evs.length > 0 ? 'bg-accent/40' : '')}>
                <span className="text-xs font-medium">{dia}</span>
                <div className="flex-1 flex flex-wrap content-end gap-0.5">
                  {evs.slice(0, 4).map((e, j) => (
                    <span key={j} className={cn('size-1.5 rounded-full', COLOR_EVENTO[e.tipo]?.punto ?? 'bg-gray-400')} title={e.etiqueta} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Leyenda */}
        {tiposPresentes.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
            {tiposPresentes.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-xs">
                <span className={cn('size-2 rounded-full', COLOR_EVENTO[t]?.punto ?? 'bg-gray-400')} />
                {COLOR_EVENTO[t]?.nombre ?? t}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

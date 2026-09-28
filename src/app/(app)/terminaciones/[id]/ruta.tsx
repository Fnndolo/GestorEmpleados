'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Un paso del retiro, con su estado ya calculado en el servidor. */
export type PasoRuta = {
  id: string
  titulo: string
  /** Nombre corto para la fila del celular ("Seg. social"). */
  corto?: string
  /** Estado en pocas palabras ("Esperando firma", "3 de 5 áreas"…). */
  detalle: string
  estado: 'hecho' | 'pendiente' | 'opcional'
  /** No lo exige el cierre: no cuenta en el avance (examen, seguridad social, soportes). */
  opcional?: boolean
}

/**
 * Ruta del retiro: en computador, los pasos a la izquierda con su estado y el
 * paso elegido a la derecha; en el celular, los pasos en una sola fila
 * horizontal arriba y el paso elegido debajo. Abre en el primer paso pendiente y
 * recuerda el elegido en la URL (?paso=), así el refresco tras una acción no
 * lo devuelve al inicio.
 */
export function RutaTerminacion({ pasos, paneles, inicial }: {
  pasos: PasoRuta[]
  paneles: Record<string, React.ReactNode>
  inicial: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  // El elegido vive en la URL; el estado local solo adelanta el cambio mientras
  // la URL se actualiza (así el clic se siente inmediato).
  const [pendiente, setPendiente] = useState<string | null>(null)
  const enUrl = params.get('paso')
  const actual = pendiente && pendiente !== enUrl ? pendiente : enUrl ?? inicial
  const elegido = pasos.find((p) => p.id === actual) ?? pasos[0]
  const hechos = pasos.filter((p) => !p.opcional && p.estado === 'hecho').length
  const obligatorios = pasos.filter((p) => !p.opcional).length
  // En el celular la fila puede no caber: el paso elegido se centra solo.
  const activoRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activoRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [elegido.id])

  function elegir(id: string) {
    setPendiente(id)
    const q = new URLSearchParams(params)
    q.set('paso', id)
    router.replace(`${pathname}?${q}`, { scroll: false })
  }

  /** Círculo del paso: ✓ si está hecho, su número si no. */
  const circulo = (p: PasoRuta, i: number, activo: boolean, extra?: string) => (
    <span className={cn(
      'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
      p.estado === 'hecho' ? 'bg-emerald-600 text-white' : activo ? 'bg-foreground text-background' : 'border bg-background text-muted-foreground',
      extra,
    )}>
      {p.estado === 'hecho' ? <Check className="size-3.5" /> : i + 1}
    </span>
  )

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      {/* Celular: una sola fila, los pasos unidos por una línea; si no caben, se desliza de lado. */}
      <ol className="-mx-4 flex items-start overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" aria-label="Ruta del retiro">
        {pasos.map((p, i) => {
          const activo = p.id === elegido.id
          return (
            <li key={p.id} className="relative flex min-w-[62px] flex-1 justify-center">
              {i > 0 && (
                <span aria-hidden className={cn('absolute right-1/2 top-3 h-px w-full', pasos[i - 1].estado === 'hecho' ? 'bg-emerald-600' : 'bg-border')} />
              )}
              <button
                ref={activo ? activoRef : undefined}
                type="button"
                onClick={() => elegir(p.id)}
                aria-current={activo ? 'step' : undefined}
                className="relative flex min-w-0 flex-col items-center gap-1 px-0.5"
              >
                {circulo(p, i, activo, activo ? 'ring-2 ring-foreground/20 ring-offset-2 ring-offset-background' : undefined)}
                <span className={cn('max-w-full truncate text-[10.5px] leading-tight', activo ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {p.corto ?? p.titulo}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <Card className="hidden py-0 lg:sticky lg:top-4 lg:block">
        <CardContent className="p-2">
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ruta del retiro</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">{hechos}/{obligatorios}</p>
          </div>
          <ol>
            {pasos.map((p, i) => {
              const activo = p.id === elegido.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => elegir(p.id)}
                    aria-current={activo ? 'step' : undefined}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60', activo && 'bg-accent')}
                  >
                    {circulo(p, i, activo)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.detalle}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <Card className="py-0">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-base font-semibold">{elegido.titulo}</h2>
              {/* En el celular la fila de pasos no alcanza a decir en qué va cada uno: se dice aquí. */}
              <p className="text-xs text-muted-foreground lg:hidden">{elegido.detalle}</p>
            </div>
            {paneles[elegido.id]}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

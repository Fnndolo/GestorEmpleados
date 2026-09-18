'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Megaphone, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Pill } from '@/components/ui-kit'
import { cn } from '@/lib/utils'
import { etiquetaTipoAviso, tonoTipoAviso } from '@/lib/avisos'
import { marcarAvisoLeido } from '@/app/(app)/avisos/acciones'

export type AvisoBanner = { id: string; titulo: string; resumen: string; tipo: string; enlace: string | null }

/**
 * «Nuevo en la app»: el último aviso sin leer, arriba de Autoservicio e Inicio.
 * Insiste hasta que la persona toque «Entendido»; si hay varios, se pasan con
 * los puntos. Es lo que reemplaza la capacitación por cada módulo nuevo.
 */
export function BannerAvisos({ avisos }: { avisos: AvisoBanner[] }) {
  const router = useRouter()
  const [indice, setIndice] = useState(0)
  const [marcando, setMarcando] = useState(false)
  if (avisos.length === 0) return null
  const a = avisos[Math.min(indice, avisos.length - 1)]

  async function entendido() {
    setMarcando(true)
    const res = await marcarAvisoLeido({ id: a.id })
    setMarcando(false)
    if (!res.ok) { toast.error(res.error); return }
    window.dispatchEvent(new Event('sg:refrescar-avisos'))
    setIndice(0)
    router.refresh()
  }

  return (
    <div className="mb-4 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background"><Megaphone className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Nuevo en la app <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
          </p>
          <p className="mt-0.5 text-sm font-bold leading-tight">{a.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.resumen}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" asChild><Link href={`/avisos?ver=${a.id}`}>Ver cómo funciona <ArrowRight className="size-4" /></Link></Button>
            <Button size="sm" variant="ghost" onClick={entendido} disabled={marcando}>{marcando ? <Spinner /> : <Check className="size-4" />} Entendido</Button>
            {avisos.length > 1 && (
              <span className="ml-auto flex items-center gap-1" aria-label={`Aviso ${indice + 1} de ${avisos.length}`}>
                {avisos.map((x, i) => (
                  <button key={x.id} type="button" onClick={() => setIndice(i)} aria-label={`Ver aviso ${i + 1}`} className={cn('size-2 rounded-full transition-colors', i === indice ? 'bg-foreground' : 'bg-foreground/25 hover:bg-foreground/50')} />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Pill } from '@/components/ui-kit'
import { etiquetaTipoAviso, tonoTipoAviso } from '@/lib/avisos'

type AvisoResumen = { id: string; titulo: string; resumen: string; tipo: string; leido: boolean; vigente: boolean; publicadoEn: string }

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MES_CORTO[d.getMonth()]}` }

/**
 * El megáfono junto a la campana: cuántos avisos de la plataforma hay sin leer
 * y una lista corta para abrirlos. Se refresca al volver a la pestaña y cada
 * minuto; la campana sigue siendo para lo que pasa con cada persona, esto es
 * para lo que cambia en la app.
 */
export function AvisosIcono() {
  const [noLeidos, setNoLeidos] = useState(0)
  const [avisos, setAvisos] = useState<AvisoResumen[]>([])
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch('/api/avisos')
      const json = await resp.json()
      setNoLeidos(json.noLeidos ?? 0)
      setAvisos(json.avisos ?? [])
    } catch {
      /* sin conexión */
    }
  }, [])

  useEffect(() => {
    const primera = setTimeout(cargar, 0)
    const id = setInterval(cargar, 60_000)
    const onFocus = () => cargar()
    window.addEventListener('focus', onFocus)
    // Marcar un aviso como leído en cualquier pantalla actualiza el contador al instante.
    window.addEventListener('sg:refrescar-avisos', onFocus)
    return () => { clearTimeout(primera); clearInterval(id); window.removeEventListener('focus', onFocus); window.removeEventListener('sg:refrescar-avisos', onFocus) }
  }, [cargar])

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Avisos de la plataforma${noLeidos ? ` (${noLeidos} sin leer)` : ''}`}>
          <Megaphone className="size-5" />
          {noLeidos > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
              {noLeidos > 9 ? '9+' : noLeidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Avisos</p>
          {noLeidos > 0 && <span className="text-xs text-muted-foreground">{noLeidos} sin leer</span>}
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {avisos.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Sin avisos por ahora.</p>
          ) : (
            <ul className="divide-y">
              {avisos.map((a) => (
                <li key={a.id}>
                  <Link href={`/avisos?ver=${a.id}`} onClick={() => setAbierto(false)} className={`block px-3 py-2.5 hover:bg-accent/60 ${!a.leido ? 'bg-accent/40' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${a.leido ? 'bg-transparent' : 'bg-destructive'}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold leading-snug">
                          {a.titulo} <Pill tone={tonoTipoAviso(a.tipo)}>{etiquetaTipoAviso(a.tipo)}</Pill>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{a.resumen}</p>
                      </div>
                      <time dateTime={a.publicadoEn} className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">{fecha(a.publicadoEn)}</time>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/avisos" onClick={() => setAbierto(false)}>Ver todos los avisos <ArrowRight className="size-3.5" /></Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { marcarLeidas } from '@/app/(app)/notificaciones-acciones'

type Notif = { id: string; titulo: string; mensaje: string; enlace: string | null; leida: boolean; creadoEn: string }

/** Campana con contador en vivo (polling cada 60 s + al recuperar foco). */
export function Campana() {
  const [noLeidas, setNoLeidas] = useState(0)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch('/api/notificaciones')
      const json = await resp.json()
      setNoLeidas(json.noLeidas ?? 0)
      setNotifs(json.notificaciones ?? [])
    } catch {
      /* sin conexión */
    }
  }, [])

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, 60_000)
    const onFocus = () => cargar()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [cargar])

  async function marcarTodas() {
    await marcarLeidas()
    setNoLeidas(0)
    setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })))
  }

  return (
    <Popover open={abierto} onOpenChange={(o) => { setAbierto(o); if (o && noLeidas > 0) marcarTodas() }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="size-5" />
          {noLeidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Notificaciones</p>
          {notifs.some((n) => !n.leida) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={marcarTodas}>
              <CheckCheck className="size-3.5" /> Marcar leídas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones.</p>
          ) : (
            <ul className="divide-y">
              {notifs.map((n) => {
                const contenido = (
                  <div className={`p-3 ${!n.leida ? 'bg-accent/40' : ''}`}>
                    <p className="text-sm font-medium leading-tight">{n.titulo}</p>
                    <p className="text-xs text-muted-foreground">{n.mensaje}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.creadoEn).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                )
                return (
                  <li key={n.id}>
                    {n.enlace ? (
                      <Link href={n.enlace} onClick={() => setAbierto(false)} className="block hover:bg-accent/60">
                        {contenido}
                      </Link>
                    ) : contenido}
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/vencimientos" onClick={() => setAbierto(false)}>Ver todos los vencimientos</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, CheckCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { marcarLeidas } from '@/app/(app)/notificaciones-acciones'
import { ActivarPush } from './activar-push'

// Los pop-ups (toast) son solo para escritorio; en móvil se usa la notificación
// del sistema (push), que además llega con la app cerrada.
const ES_MOVIL =
  typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)

type Notif = { id: string; titulo: string; mensaje: string; enlace: string | null; leida: boolean; evento: string | null; creadoEn: string }

/**
 * Algunos mensajes llegan en HTML (la misma plantilla del correo, p. ej. el
 * desglose del pago de vacaciones). Aquí se muestran como texto plano legible:
 * celdas separadas con ":", filas con "·", sin etiquetas.
 */
function textoPlano(html: string): string {
  if (!html.includes('<')) return html
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/td>\s*<td[^>]*>/gi, ': ')
    .replace(/<\/tr>/gi, ' · ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\s*·\s*)+/g, ' · ')
    .trim()
    .replace(/\s*·\s*$/, '')
}

/** Campana con contador en vivo (polling cada 30 s + al recuperar foco) y toast al llegar algo nuevo. */
export function Campana({ verVencimientos = false }: { verVencimientos?: boolean }) {
  const router = useRouter()
  const [noLeidas, setNoLeidas] = useState(0)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [abierto, setAbierto] = useState(false)
  // ids ya vistos: para mostrar toast SOLO de lo que llega nuevo (no en la primera carga)
  const vistos = useRef<Set<string> | null>(null)

  // Pop-up de notificación: tarjeta opaca, con borde y sombra, texto recortado
  // para no desbordarse. Ancho fijo consistente con el Toaster (top-right).
  const mostrarPopup = useCallback(
    (n: Notif) => {
      toast.custom(
        (id) => (
          <div className="flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{n.titulo}</p>
              <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{textoPlano(n.mensaje)}</p>
              {n.enlace && (
                <button
                  type="button"
                  onClick={() => { router.push(n.enlace!); toast.dismiss(id) }}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Ver
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => toast.dismiss(id)}
              className="-mr-1 -mt-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        ),
        { duration: 7000 },
      )
    },
    [router],
  )

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch('/api/notificaciones')
      const json = await resp.json()
      const lista: Notif[] = json.notificaciones ?? []
      // Eventos con el pop-up apagado por el administrador (config de Notificaciones).
      const sinPopup = new Set<string>(json.popupDesactivados ?? [])
      setNoLeidas(json.noLeidas ?? 0)
      setNotifs(lista)

      if (vistos.current === null) {
        // Primera carga: registrar sin avisar
        vistos.current = new Set(lista.map((n) => n.id))
      } else {
        // Solo sale pop-up de eventos no desactivados (los sin catalogar siempre salen).
        // En móvil no se muestra pop-up: allí se usa la notificación del sistema (push).
        const nuevas = ES_MOVIL
          ? []
          : lista.filter((n) => !n.leida && !vistos.current!.has(n.id) && !(n.evento && sinPopup.has(n.evento)))
        // Pop-up llamativo pero discreto: máximo 2 a la vez. Tarjeta sólida y
        // auto-contenida (toast.custom) para que no se vea translúcida ni se desborde.
        for (const n of nuevas.slice(0, 2)) mostrarPopup(n)
        // Marca TODAS como vistas (incluso las omitidas) para no reevaluarlas luego.
        for (const n of lista) vistos.current.add(n.id)
      }
    } catch {
      /* sin conexión */
    }
  }, [mostrarPopup])

  useEffect(() => {
    const primera = setTimeout(cargar, 0)
    const id = setInterval(cargar, 30_000)
    const onFocus = () => cargar()
    window.addEventListener('focus', onFocus)

    // Pop-up instantáneo: el service worker avisa apenas llega un push mientras
    // la app está abierta; refrescamos de inmediato (la dedupe por id evita dobles).
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    const onMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === 'nueva-notificacion') cargar()
    }
    sw?.addEventListener('message', onMensaje)

    // Refresco inmediato disparado por otras partes de la app (p. ej. el botón de
    // prueba en Inicio): así el pop-up sale al instante sin esperar el sondeo.
    const onRefrescar = () => cargar()
    window.addEventListener('sg:refrescar-notifs', onRefrescar)

    return () => {
      clearTimeout(primera)
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      sw?.removeEventListener('message', onMensaje)
      window.removeEventListener('sg:refrescar-notifs', onRefrescar)
    }
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
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {notifs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones.</p>
          ) : (
            <ul className="divide-y">
              {notifs.map((n) => {
                const contenido = (
                  <div className={`p-3 ${!n.leida ? 'bg-accent/40' : ''}`}>
                    <p className="text-sm font-medium leading-snug">{n.titulo}</p>
                    <p className="text-xs text-muted-foreground">{textoPlano(n.mensaje)}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
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
        </div>
        <div className="space-y-1 border-t p-2">
          <ActivarPush />
          {verVencimientos && (
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/vencimientos" onClick={() => setAbierto(false)}>Ver todos los vencimientos</Link>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

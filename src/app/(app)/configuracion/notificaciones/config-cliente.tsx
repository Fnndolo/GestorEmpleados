'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Bell, Mail, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { EVENTOS_NOTIF, type ClaveEvento } from '@/lib/notificaciones/catalogo'
import { configurarPopupEvento, configurarCorreoEvento } from './acciones'

/** Agrupa los eventos del catálogo por módulo, en el orden en que aparecen. */
function porModulo() {
  const grupos = new Map<string, typeof EVENTOS_NOTIF>()
  for (const e of EVENTOS_NOTIF) {
    const arr = grupos.get(e.modulo) ?? []
    arr.push(e)
    grupos.set(e.modulo, arr)
  }
  return [...grupos.entries()]
}

export function ConfigNotificaciones({
  popupPorEvento, correoPorEvento,
}: {
  popupPorEvento: Record<string, boolean>
  correoPorEvento: Record<string, boolean>
}) {
  // Estado local optimista por canal: clave -> ¿activo?
  const [popup, setPopup] = useState<Record<string, boolean>>(popupPorEvento)
  const [correo, setCorreo] = useState<Record<string, boolean>>(correoPorEvento)

  async function alternarPopup(evento: ClaveEvento, valor: boolean) {
    const previo = popup[evento]
    setPopup((s) => ({ ...s, [evento]: valor }))
    const res = await configurarPopupEvento({ evento, popup: valor })
    if (!res.ok) {
      setPopup((s) => ({ ...s, [evento]: previo }))
      toast.error(res.error ?? 'No se pudo guardar el cambio.')
    }
  }

  async function alternarCorreo(evento: ClaveEvento, valor: boolean) {
    const previo = correo[evento]
    setCorreo((s) => ({ ...s, [evento]: valor }))
    const res = await configurarCorreoEvento({ evento, correo: valor })
    if (!res.ok) {
      setCorreo((s) => ({ ...s, [evento]: previo }))
      toast.error(res.error ?? 'No se pudo guardar el cambio.')
    }
  }

  return (
    <div className="space-y-6">
      {/* La campana no tiene interruptor porque no se puede apagar: es el
          registro del aviso, y sin él no quedaría rastro de que se notificó. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Bell className="size-3.5" /> Campana y celular: siempre</span>
        <span className="flex items-center gap-1.5"><MessageSquare className="size-3.5" /> Pop-up en pantalla</span>
        <span className="flex items-center gap-1.5"><Mail className="size-3.5" /> Correo</span>
      </p>

      {porModulo().map(([modulo, eventos]) => (
        <section key={modulo}>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">{modulo}</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {eventos.map((e) => (
                <div key={e.clave} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 transition-colors hover:bg-accent/40">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.etiqueta}</span>
                    <span className="block text-xs text-muted-foreground">{e.descripcion}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-5">
                    <label className="flex items-center gap-2" htmlFor={`pop-${e.clave}`}>
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <Switch
                        id={`pop-${e.clave}`}
                        checked={popup[e.clave] ?? true}
                        onCheckedChange={(v) => alternarPopup(e.clave, v)}
                        aria-label={`Pop-up de ${e.etiqueta}`}
                      />
                    </label>
                    <label className="flex items-center gap-2" htmlFor={`mail-${e.clave}`}>
                      <Mail className="size-4 text-muted-foreground" />
                      <Switch
                        id={`mail-${e.clave}`}
                        checked={correo[e.clave] ?? false}
                        onCheckedChange={(v) => alternarCorreo(e.clave, v)}
                        aria-label={`Correo de ${e.etiqueta}`}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

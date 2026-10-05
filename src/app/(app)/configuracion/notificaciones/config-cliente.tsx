'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Ayuda } from '@/components/ui-kit/ayuda'
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
    <div className="space-y-5">
      {porModulo().map(([modulo, eventos]) => (
        <section key={modulo}>
          {/* Los íconos de las columnas van en la línea del módulo, alineados
              con los interruptores: globo = pop-up, sobre = correo. La campana no
              tiene interruptor porque no se puede apagar: es el registro del
              aviso, y sin él no quedaría rastro de que se notificó. */}
          <div className="mb-1.5 flex items-end gap-3 px-3 text-muted-foreground sm:px-4">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium uppercase tracking-wider">{modulo}</h2>
            <span className="grid w-8 place-items-center" title="Pop-up en pantalla">
              <MessageSquare className="size-4" aria-hidden /><span className="sr-only">Pop-up</span>
            </span>
            <span className="grid w-8 place-items-center" title="Correo">
              <Mail className="size-4" aria-hidden /><span className="sr-only">Correo</span>
            </span>
          </div>
          <Card className="py-0">
            <CardContent className="divide-y p-0">
              {eventos.map((e) => (
                <div key={e.clave} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:px-4">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
                    {e.etiqueta}
                    <span className="ml-1.5 inline-flex align-[-2px]">
                      <Ayuda texto={e.descripcion} etiqueta={`Sobre ${e.etiqueta.toLowerCase()}`} />
                    </span>
                  </p>
                  <span className="grid w-8 shrink-0 place-items-center">
                    <Switch
                      checked={popup[e.clave] ?? true}
                      onCheckedChange={(v) => alternarPopup(e.clave, v)}
                      aria-label={`Pop-up de ${e.etiqueta}`} title="Pop-up"
                    />
                  </span>
                  <span className="grid w-8 shrink-0 place-items-center">
                    <Switch
                      checked={correo[e.clave] ?? false}
                      onCheckedChange={(v) => alternarCorreo(e.clave, v)}
                      aria-label={`Correo de ${e.etiqueta}`} title="Correo"
                    />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

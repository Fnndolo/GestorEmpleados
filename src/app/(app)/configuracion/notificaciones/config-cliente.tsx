'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { EVENTOS_NOTIF, type ClaveEvento } from '@/lib/notificaciones/catalogo'
import { configurarPopupEvento } from './acciones'

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

export function ConfigNotificaciones({ popupPorEvento }: { popupPorEvento: Record<string, boolean> }) {
  // Estado local optimista: clave -> ¿pop-up activo?
  const [estado, setEstado] = useState<Record<string, boolean>>(popupPorEvento)

  async function alternar(evento: ClaveEvento, popup: boolean) {
    const previo = estado[evento]
    setEstado((s) => ({ ...s, [evento]: popup })) // optimista
    const res = await configurarPopupEvento({ evento, popup })
    if (!res.ok) {
      setEstado((s) => ({ ...s, [evento]: previo })) // revertir
      toast.error(res.error ?? 'No se pudo guardar el cambio.')
    }
  }

  return (
    <div className="space-y-6">
      {porModulo().map(([modulo, eventos]) => (
        <section key={modulo}>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">{modulo}</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {eventos.map((e) => {
                const activo = estado[e.clave] ?? true
                return (
                  <div key={e.clave} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40">
                    <label htmlFor={`ev-${e.clave}`} className="min-w-0 cursor-pointer">
                      <span className="block text-sm font-medium">{e.etiqueta}</span>
                      <span className="block text-xs text-muted-foreground">{e.descripcion}</span>
                    </label>
                    <Switch
                      id={`ev-${e.clave}`}
                      checked={activo}
                      onCheckedChange={(v) => alternar(e.clave, v)}
                      aria-label={`Pop-up de ${e.etiqueta}`}
                    />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

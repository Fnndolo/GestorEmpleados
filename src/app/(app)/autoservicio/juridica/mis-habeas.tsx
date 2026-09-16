'use client'

import { useState } from 'react'
import { ChevronDown, FileLock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Pill } from '@/components/ui-kit'

/**
 * Las consultas y reclamos de habeas data de la persona. Plegada: tipo, fecha
 * y estado; al tocarla, lo que pidió y, cuando Jurídica respondió, la respuesta
 * con su fecha.
 */
export type HabeasItem = {
  id: string
  tipo: string
  estado: string
  descripcion: string
  radicada: string
  limite: string | null
  respuesta: string | null
  respondidaEn: string | null
}

export function MisHabeas({ items }: { items: HabeasItem[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  if (items.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no has radicado consultas ni reclamos.</CardContent></Card>
  }
  return (
    <Card><CardContent className="divide-y p-0">
      {items.map((h) => {
        const expandida = abierta === h.id
        const respondida = h.estado === 'RESUELTO'
        return (
          <div key={h.id}>
            <button
              type="button"
              onClick={() => setAbierta(expandida ? null : h.id)}
              aria-expanded={expandida}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                <FileLock className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{h.tipo === 'CONSULTA' ? 'Consulta' : 'Reclamo'}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Radicada {h.radicada}{respondida && h.respondidaEn ? ` · respondida ${h.respondidaEn}` : h.limite ? ` · respuesta antes del ${h.limite}` : ''}
                </span>
              </span>
              <Pill tone={respondida ? 'ok' : 'warn'}>{respondida ? 'Respondida' : 'En trámite'}</Pill>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
            </button>
            {expandida && (
              <div className="space-y-2 border-t border-dashed bg-muted/20 px-4 py-3 text-sm">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tu solicitud</p>
                  <p className="whitespace-pre-wrap">{h.descripcion}</p>
                </div>
                {respondida && h.respuesta && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Respuesta{h.respondidaEn ? ` · ${h.respondidaEn}` : ''}</p>
                    <p className="whitespace-pre-wrap rounded-lg border bg-card p-3">{h.respuesta}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </CardContent></Card>
  )
}

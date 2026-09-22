'use client'

import { useState } from 'react'
import { ChevronDown, CalendarRange, Clock, HeartPulse, FileBadge, CalendarClock, FileCheck, Check, X, CircleDashed, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill } from '@/components/ui-kit'
import { colorAvatar } from '@/lib/etiquetas'
import { TONO_SOLICITUD } from '@/lib/solicitudes-texto'

/**
 * Lista de solicitudes ya con su historia: quién pidió qué, en qué quedó y
 * quién lo decidió. Plegada muestra una línea por solicitud; al tocarla salen
 * los pasos con nombre, fecha y comentario de cada decisión.
 *
 * `conColaborador` pone la foto y el nombre (archivo de Aprobaciones); en la
 * ficha de una persona sobra y va el icono del tipo.
 *
 * Los soportes que se adjuntaron (incapacidad, licencia, comprobante) se ven
 * ahí mismo al desplegar: las imágenes en miniatura y ampliables, los PDF en
 * el visor; igual que en la bandeja de lo pendiente.
 */
export type HistorialItem = {
  id: string
  tipo: string
  tipoEtiqueta: string
  estado: string
  estadoEtiqueta: string
  cuando: string
  motivo: string | null
  creadoEn: string
  resultado: string | null
  /** Soportes adjuntos a la solicitud. */
  documentos: { id: string; nombre: string; esImagen: boolean }[]
  colaborador: { id: string; nombre: string; nombreCorto: string; iniciales: string; fotoUrl: string | null; jefeInmediatoId: string | null }
  pasos: { rol: string; estado: string; decididoPorId: string | null; decididoPor: string | null; decididoEn: string | null; comentario: string | null }[]
}

const ICONO: Record<string, React.ElementType> = {
  VACACIONES: CalendarRange, PERMISO: Clock, INCAPACIDAD: HeartPulse, LICENCIA: CalendarClock, CERTIFICACION_LABORAL: FileBadge,
}
const PASO: Record<string, { icono: React.ElementType; clase: string; label: string }> = {
  APROBADO: { icono: Check, clase: 'text-emerald-600 dark:text-emerald-400', label: 'Aprobó' },
  RECHAZADO: { icono: X, clase: 'text-rose-600 dark:text-rose-400', label: 'Rechazó' },
  PENDIENTE: { icono: CircleDashed, clase: 'text-amber-600 dark:text-amber-400', label: 'Pendiente' },
}

export function HistorialSolicitudes({ items, conColaborador = false, vacio = 'Sin solicitudes.' }: {
  items: HistorialItem[]
  conColaborador?: boolean
  vacio?: string
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [imagenAmpliada, setImagenAmpliada] = useState<{ id: string; nombre: string } | null>(null)
  if (items.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  }
  return (
    <Card><CardContent className="divide-y p-0">
      {items.map((s) => {
        const expandida = abierta === s.id
        const Icono = ICONO[s.tipo] ?? FileCheck
        return (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => setAbierta(expandida ? null : s.id)}
              aria-expanded={expandida}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {conColaborador ? (
                <Avatar className="size-8 shrink-0">
                  {s.colaborador.fotoUrl && <AvatarImage src={s.colaborador.fotoUrl} alt="" />}
                  <AvatarFallback className="text-[11px] font-semibold text-white" style={{ backgroundColor: colorAvatar(s.colaborador.nombre) }}>{s.colaborador.iniciales}</AvatarFallback>
                </Avatar>
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                  <Icono className="size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {conColaborador ? <>{s.colaborador.nombreCorto} <span className="text-muted-foreground">· {s.tipoEtiqueta}</span></> : s.tipoEtiqueta}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.cuando}{s.motivo ? ` · ${s.motivo}` : ''}
                  {s.documentos.length > 0 && ` · ${s.documentos.length} adjunto${s.documentos.length === 1 ? '' : 's'}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Pill tone={TONO_SOLICITUD[s.estado] ?? 'muted'}>{s.estadoEtiqueta}</Pill>
                <span className="text-[11px] text-muted-foreground">{s.creadoEn}</span>
              </span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
            </button>

            {expandida && (
              <div className="space-y-2 border-t border-dashed bg-muted/20 px-4 py-3 text-sm">
                {s.motivo && <p><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Motivo · </span>{s.motivo}</p>}
                {s.pasos.length > 0 && (
                  <ul className="space-y-1.5">
                    {s.pasos.map((p, i) => {
                      const e = PASO[p.estado] ?? PASO.PENDIENTE
                      const IconoPaso = e.icono
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <IconoPaso className={cn('mt-0.5 size-4 shrink-0', e.clase)} />
                          <div className="min-w-0">
                            <p>
                              <span className={cn('font-medium', e.clase)}>{e.label}</span>
                              {p.decididoPor ? ` ${p.decididoPor}` : ` · ${p.rol}`}
                              {p.decididoEn && <span className="text-xs text-muted-foreground"> · {p.decididoEn}</span>}
                            </p>
                            {p.comentario && <p className="text-xs text-muted-foreground">&ldquo;{p.comentario}&rdquo;</p>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {s.resultado && <p className="text-xs text-muted-foreground">{s.resultado}</p>}
                {s.documentos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Soportes</p>
                    <div className="flex flex-wrap items-start gap-2">
                      {s.documentos.map((d) =>
                        d.esImagen ? (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setImagenAmpliada(d)}
                            className="group/img overflow-hidden rounded-lg border bg-muted/30 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`${d.nombre} — clic para ampliar`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/documentos/${d.id}`}
                              alt={d.nombre}
                              className="h-28 w-36 object-contain transition-transform group-hover/img:scale-105"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <VisorPdf
                            key={d.id}
                            documentoId={d.id}
                            titulo={d.nombre}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Paperclip className="size-3.5" /> {d.nombre}
                          </VisorPdf>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Ampliación del soporte de imagen, sin salir del historial. */}
      <Dialog open={imagenAmpliada !== null} onOpenChange={(o) => { if (!o) setImagenAmpliada(null) }}>
        <DialogContent className="max-w-[calc(100%-2.5rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-base">{imagenAmpliada?.nombre}</DialogTitle>
          </DialogHeader>
          {imagenAmpliada && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documentos/${imagenAmpliada.id}`} alt={imagenAmpliada.nombre} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  )
}

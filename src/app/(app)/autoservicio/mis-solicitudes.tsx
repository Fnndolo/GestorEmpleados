'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Download, TreePalm, Clock, Stethoscope, File, FileCheck, TriangleAlert, Check, X, CircleDashed, CalendarClock, Paperclip, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Pill, type PillTone } from '@/components/ui-kit'
import { responderContrapropuesta, corregirMiSoporte } from './acciones'

/** El estado se lee de un vistazo por color, no solo por texto. */
const TONO_ESTADO: Record<string, PillTone> = {
  APROBADA: 'ok', DISFRUTADA: 'ok',
  EN_APROBACION: 'warn', PENDIENTE: 'warn', SOLICITADA: 'warn',
  EN_NEGOCIACION: 'accent',
  DEVUELTA: 'warn',
  EN_DISFRUTE: 'info',
  RECHAZADA: 'bad',
  CANCELADA: 'muted', REGISTRADA: 'muted',
}

/** Ícono y color por tipo de solicitud — mismo lenguaje visual que los tiles. */
const ICONO_SOL: Record<string, { i: React.ElementType; c: string }> = {
  VACACIONES: { i: TreePalm, c: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' },
  PERMISO: { i: Clock, c: 'bg-sky-500/12 text-sky-600 dark:text-sky-400' },
  INCAPACIDAD: { i: Stethoscope, c: 'bg-rose-500/12 text-rose-600 dark:text-rose-400' },
  LICENCIA: { i: File, c: 'bg-violet-500/12 text-violet-600 dark:text-violet-400' },
  CERTIFICACION_LABORAL: { i: File, c: 'bg-teal-500/12 text-teal-600 dark:text-teal-400' },
  OTRA: { i: FileCheck, c: 'bg-foreground/8 text-foreground' },
}

export type PasoItem = {
  rol: string
  estado: string // PENDIENTE | APROBADO | RECHAZADO | ...
  comentario: string | null
  decididoEn: string | null
}

export type SolicitudItem = {
  id: string
  tipo: string
  estado: string
  estadoEtiqueta: string
  etiqueta: string
  creadoEn: string
  resultado: string | null
  certId: string | null
  /** Detalle ya formateado en el servidor: pares etiqueta → valor. */
  campos: { label: string; valor: string }[]
  advertencias: string[]
  pasos: PasoItem[]
  /** Contrapropuesta de fechas del jefe pendiente de respuesta (solo vacaciones EN_NEGOCIACION). */
  contrapropuesta: { fechaInicio: string; fechaFin: string; comentario: string | null } | null
  /** Liquidación del pago de vacaciones aprobadas (cifras ya formateadas en COP). */
  liquidacion: { filas: { label: string; valor: string }[]; total: string } | null
  /** "Programada por la empresa" cuando la novedad no nació de una solicitud propia. */
  origen?: string | null
}

const ESTADO_PASO: Record<string, { label: string; icono: React.ElementType; clase: string }> = {
  APROBADO: { label: 'Aprobado', icono: Check, clase: 'text-emerald-600 dark:text-emerald-400' },
  RECHAZADO: { label: 'Rechazado', icono: X, clase: 'text-rose-600 dark:text-rose-400' },
  PENDIENTE: { label: 'Pendiente', icono: CircleDashed, clase: 'text-amber-600 dark:text-amber-400' },
}

/**
 * Lista de solicitudes del colaborador con detalle expandible (acordeón):
 * al presionar una fila se abre su detalle y se cierra la que estuviera abierta.
 */
export function MisSolicitudes({ solicitudes }: { solicitudes: SolicitudItem[] }) {
  const router = useRouter()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null) // solicitudId con el motivo abierto
  const [motivoRechazo, setMotivoRechazo] = useState('')
  // Corrección de soporte de licencia devuelta
  const inputSoporte = useRef<HTMLInputElement>(null)
  const [archivoSoporte, setArchivoSoporte] = useState<File | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)

  async function enviarSoporteCorregido(solicitudId: string) {
    if (!archivoSoporte) { toast.error('Adjunta el soporte corregido.'); return }
    setCorrigiendo(solicitudId)
    try {
      const fd = new FormData()
      fd.append('archivo', archivoSoporte)
      fd.append('entidadTipo', 'Solicitud')
      fd.append('entidadId', solicitudId)
      fd.append('nombre', `Soporte corregido — ${archivoSoporte.name}`)
      const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      if (!up.ok) throw new Error('No se pudo subir el archivo.')
      const res = await corregirMiSoporte({ solicitudId })
      if (!res.ok) throw new Error(res.error)
      toast.success('Soporte enviado. Talento Humano lo validará sobre esta misma solicitud.')
      setArchivoSoporte(null)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el soporte.')
    } finally {
      setCorrigiendo(null)
    }
  }

  async function responder(solicitudId: string, aceptar: boolean) {
    setRespondiendo(solicitudId)
    const res = await responderContrapropuesta({
      solicitudId, aceptar,
      comentario: !aceptar && motivoRechazo.trim() ? motivoRechazo.trim() : undefined,
    })
    setRespondiendo(null)
    if (res.ok) {
      toast.success(aceptar
        ? 'Fechas concertadas. Tu solicitud sigue su trámite.'
        : 'Le avisamos a tu jefe; la solicitud vuelve a su bandeja con tus fechas originales.')
      setRechazando(null); setMotivoRechazo('')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Card><CardContent className="divide-y p-0">
      {solicitudes.map((s) => {
        const { i: Icono, c } = ICONO_SOL[s.tipo] ?? ICONO_SOL.OTRA
        const expandida = abierta === s.id
        return (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => setAbierta(expandida ? null : s.id)}
              aria-expanded={expandida}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', c)}>
                <Icono className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.etiqueta}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.creadoEn}{s.origen ? ` · ${s.origen}` : ''}{s.resultado && !s.certId && !expandida ? ` · ${s.resultado}` : ''}
                </p>
              </div>
              <Pill tone={TONO_ESTADO[s.estado] ?? 'muted'}>{s.estadoEtiqueta}</Pill>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
            </button>

            {/* Licencia devuelta por soporte insuficiente: se corrige aquí mismo, sin crear otra solicitud. */}
            {s.estado === 'DEVUELTA' && (
              <div className="mx-3 mb-3 space-y-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-[13px] font-medium">El soporte no pudo validarse</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {s.resultado?.replace(/^Soporte no validado:\s*/, '') ?? 'Adjunta el soporte que acredite el hecho.'}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">Tu licencia sigue abierta: sube el soporte corregido y vuelve a validación.</p>
                  </div>
                </div>
                <input
                  ref={inputSoporte}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setArchivoSoporte(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => inputSoporte.current?.click()} disabled={corrigiendo !== null}>
                    <Paperclip className="size-4" /> {archivoSoporte ? archivoSoporte.name : 'Adjuntar soporte'}
                  </Button>
                  <Button size="sm" onClick={() => enviarSoporteCorregido(s.id)} disabled={corrigiendo !== null || !archivoSoporte}>
                    {corrigiendo === s.id ? <Spinner /> : <FileUp className="size-4" />} Enviar corrección
                  </Button>
                </div>
              </div>
            )}

            {/* Contrapropuesta del jefe: exige respuesta, así que se ve sin expandir. */}
            {s.estado === 'EN_NEGOCIACION' && s.contrapropuesta && (
              <div className="mx-3 mb-3 space-y-2.5 rounded-lg border border-violet-500/40 bg-violet-500/5 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
                  <div>
                    <p className="text-[13px] font-medium">Tu jefe propone otras fechas</p>
                    <p className="mt-0.5 text-sm">
                      Del <strong>{s.contrapropuesta.fechaInicio}</strong> al <strong>{s.contrapropuesta.fechaFin}</strong>
                    </p>
                    {s.contrapropuesta.comentario && (
                      <p className="mt-0.5 text-muted-foreground">"{s.contrapropuesta.comentario}"</p>
                    )}
                  </div>
                </div>

                {rechazando === s.id ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Motivo del rechazo (opcional)"
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setRechazando(null); setMotivoRechazo('') }}>Cancelar</Button>
                      <Button size="sm" variant="outline" onClick={() => responder(s.id, false)} disabled={respondiendo === s.id}>
                        {respondiendo === s.id ? <Spinner /> : <X className="size-4" />} Rechazar contrapropuesta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRechazando(s.id)} disabled={respondiendo === s.id}>
                      <X className="size-4" /> Rechazar
                    </Button>
                    <Button size="sm" onClick={() => responder(s.id, true)} disabled={respondiendo === s.id}>
                      {respondiendo === s.id ? <Spinner /> : <Check className="size-4" />} Aceptar fechas
                    </Button>
                  </div>
                )}
              </div>
            )}

            {expandida && (
              <div className="space-y-3 border-t border-dashed bg-muted/20 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-150">
                {s.campos.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                    {s.campos.map((cpo) => (
                      <div key={cpo.label} className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{cpo.label}</dt>
                        <dd className="text-sm">{cpo.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {s.advertencias.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <ul className="space-y-1">
                      {s.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}

                {s.liquidacion && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Liquidación del pago (RIT art. 42)</p>
                    <div className="overflow-hidden rounded-lg border bg-card">
                      <dl className="divide-y">
                        {s.liquidacion.filas.map((f) => (
                          <div key={f.label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                            <dt className="text-muted-foreground">{f.label}</dt>
                            <dd className="tabular-nums">{f.valor}</dd>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 bg-emerald-500/8 px-3 py-2 text-sm">
                          <dt className="font-bold">Total a pagar</dt>
                          <dd className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{s.liquidacion.total}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                )}

                {s.pasos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estado del trámite</p>
                    <ul className="space-y-1.5">
                      {s.pasos.map((p, i) => {
                        const e = ESTADO_PASO[p.estado] ?? ESTADO_PASO.PENDIENTE
                        const IconoPaso = e.icono
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <IconoPaso className={cn('mt-0.5 size-4 shrink-0', e.clase)} />
                            <div className="min-w-0">
                              <p>
                                {p.rol} — <span className={cn('font-medium', e.clase)}>{e.label}</span>
                                {p.decididoEn && <span className="text-xs text-muted-foreground"> · {p.decididoEn}</span>}
                              </p>
                              {p.comentario && <p className="text-xs text-muted-foreground">"{p.comentario}"</p>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {s.resultado && !s.certId && (
                  <div>
                    <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultado</p>
                    <p className="text-sm">{s.resultado}</p>
                  </div>
                )}

                {s.certId && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/api/documentos/${s.certId}`} target="_blank" rel="noreferrer">
                      <Download className="size-4" /> Descargar certificación (PDF)
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </CardContent></Card>
  )
}

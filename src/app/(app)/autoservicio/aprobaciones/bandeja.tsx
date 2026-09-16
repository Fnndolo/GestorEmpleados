'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, CalendarClock, Paperclip, FilePenLine, Scale, TriangleAlert, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pill } from '@/components/ui-kit'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { colorAvatar } from '@/lib/etiquetas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { resolverPaso, emitirCertificacion, proponerFechas } from '../acciones'

type Solicitud = {
  id: string; pasoId: string; tipo: string; esPasoJefe: boolean; colaborador: string; colaboradorId: string; sede: string
  iniciales: string; fotoUrl: string | null
  /** Fecha corta de radicación ("16 sep"). */
  creadoEn: string
  /** Lo que se pide, en una línea corta ("29 sep · 08:00–12:00"). */
  cuando: string
  /** Texto libre del colaborador; puede ser largo. */
  motivo: string | null
  fechaInicio: string; fechaFin: string
  documentos: { id: string; nombre: string; esImagen: boolean }[]; esCertFinal: boolean
  licenciaDerecho: boolean; licenciaFundamento: string | null
  calculoVacaciones: { dias: number; saldo: number; anticipadas: boolean; diasAnticipados: number; advertencias: string[] } | null
  /** Contrapropuesta de fechas que el colaborador rechazó (solo vacaciones). */
  contrapropuestaRechazada: { fechaInicio: string; fechaFin: string; respuesta: string | null } | null
  /** La solicitud fue devuelta y el colaborador ya corrigió el soporte. */
  soporteCorregido: boolean
}
const TIPO: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', CERTIFICACION_LABORAL: 'Certificación', LICENCIA: 'Licencia' }

export function BandejaAprobaciones({ solicitudes, plazoComprobanteDias }: { solicitudes: Solicitud[]; plazoComprobanteDias: number }) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  // Permiso: pedir el comprobante de asistencia. Se guarda solo lo desmarcado
  // (por pasoId): si nadie toca la casilla, se pide.
  const [sinComprobante, setSinComprobante] = useState<Record<string, boolean>>({})
  const exigeComprobante = (pasoId: string) => !sinComprobante[pasoId]
  const plazoTexto = plazoComprobanteDias === 1 ? '1 día hábil de plazo' : `${plazoComprobanteDias} días hábiles de plazo`
  const toggleComprobante = (pasoId: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Checkbox checked={exigeComprobante(pasoId)} onCheckedChange={(v) => setSinComprobante((p) => ({ ...p, [pasoId]: v !== true }))} />
      <span>Pedir comprobante de asistencia <span className="opacity-80">({plazoTexto})</span></span>
    </label>
  )
  const [cambioFechas, setCambioFechas] = useState<string | null>(null) // pasoId con el formulario abierto
  const [soporteInvalido, setSoporteInvalido] = useState<string | null>(null) // pasoId de licencia de ley devuelta
  const [comentario, setComentario] = useState('')
  const [nuevaIni, setNuevaIni] = useState('')
  const [nuevaFin, setNuevaFin] = useState('')
  const [certDe, setCertDe] = useState<Solicitud | null>(null)
  const [imagenAmpliada, setImagenAmpliada] = useState<{ id: string; nombre: string } | null>(null)
  // Plegadas por defecto: quién, qué y los botones bastan para decidir lo
  // rutinario; sede, saldo, avisos, soportes y opciones finas salen al tocar.
  const [abierta, setAbierta] = useState<string | null>(null)

  async function resolver(pasoId: string, aprobar: boolean, conFechas = false) {
    setProcesando(pasoId)
    const esPermiso = solicitudes.find((x) => x.pasoId === pasoId)?.tipo === 'PERMISO'
    const res = await resolverPaso({
      pasoId, aprobar, comentario: comentario || undefined,
      nuevaFechaInicio: conFechas ? nuevaIni : undefined,
      nuevaFechaFin: conFechas ? nuevaFin : undefined,
      exigirComprobante: esPermiso && aprobar ? exigeComprobante(pasoId) : undefined,
    })
    setProcesando(null)
    if (res.ok) {
      toast.success(aprobar ? (conFechas ? 'Aprobada con nuevas fechas.' : 'Aprobada.') : 'Rechazada.')
      setCambioFechas(null); setSoporteInvalido(null); setComentario(''); setNuevaIni(''); setNuevaFin('')
      router.refresh()
    } else toast.error(res.error)
  }

  /** Vacaciones: el jefe no cambia las fechas de una vez, propone y el colaborador responde. */
  async function contraproponer(pasoId: string) {
    setProcesando(pasoId)
    const res = await proponerFechas({
      pasoId, fechaInicio: nuevaIni, fechaFin: nuevaFin,
      comentario: comentario || undefined,
    })
    setProcesando(null)
    if (res.ok) {
      toast.success('Contrapropuesta enviada. El colaborador debe aceptarla o rechazarla.')
      setCambioFechas(null); setComentario(''); setNuevaIni(''); setNuevaFin('')
      router.refresh()
    } else toast.error(res.error)
  }

  /** Licencia de ley: se registra validando el soporte (no se "aprueba"). */
  async function registrarLicencia(pasoId: string) {
    setProcesando(pasoId)
    const res = await resolverPaso({ pasoId, aprobar: true })
    setProcesando(null)
    if (res.ok) { toast.success('Licencia registrada.'); router.refresh() } else toast.error(res.error)
  }

  /** Licencia de ley cuyo soporte no acredita el hecho: se devuelve con motivo escrito. */
  async function devolverPorSoporte(pasoId: string) {
    if (!comentario.trim()) { toast.error('Explica qué falta en el soporte.'); return }
    setProcesando(pasoId)
    const res = await resolverPaso({ pasoId, aprobar: false, comentario })
    setProcesando(null)
    if (res.ok) {
      toast.success('Devuelta al colaborador para que corrija el soporte.')
      setSoporteInvalido(null); setComentario(''); router.refresh()
    } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {solicitudes.map((s) => {
        const expandida = abierta === s.id
        const avisos = (s.calculoVacaciones?.advertencias.length ?? 0) + (s.contrapropuestaRechazada ? 1 : 0)
        return (
        <Card key={s.id}>
          <CardContent className="py-3">
            <button
              type="button"
              onClick={() => setAbierta(expandida ? null : s.id)}
              aria-expanded={expandida}
              className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-9 shrink-0">
                {s.fotoUrl && <AvatarImage src={s.fotoUrl} alt="" />}
                <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: colorAvatar(s.colaborador) }}>{s.iniciales}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold">{s.colaborador}</span>
                  <Pill tone="muted">{TIPO[s.tipo]}</Pill>
                  {s.calculoVacaciones?.anticipadas && <Pill tone="warn">Anticipadas</Pill>}
                  {s.soporteCorregido && <Pill tone="ok">Soporte corregido</Pill>}
                  {s.contrapropuestaRechazada && <Pill tone="bad">Rechazó las fechas</Pill>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {s.cuando}{s.motivo ? ` · ${s.motivo}` : ''}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground/80">
                  {s.esPasoJefe ? 'Jefe inmediato' : 'Talento Humano'} · {s.creadoEn}
                  {s.documentos.length > 0 && ` · ${s.documentos.length} adjunto${s.documentos.length === 1 ? '' : 's'}`}
                  {avisos > 0 && ` · ${avisos} aviso${avisos === 1 ? '' : 's'}`}
                </span>
              </span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
            </button>

            {expandida && (
            <div className="mt-3 space-y-2.5 border-t pt-3">
              <div className="min-w-0">
                {s.motivo && (
                  <p className="text-sm">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Motivo · </span>{s.motivo}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{s.sede} · radicada el {s.creadoEn}</p>
                {s.calculoVacaciones && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pide {s.calculoVacaciones.dias} día{s.calculoVacaciones.dias === 1 ? '' : 's'} hábiles · saldo disponible: {s.calculoVacaciones.saldo}
                    {s.calculoVacaciones.anticipadas && ` · ${s.calculoVacaciones.diasAnticipados} anticipado${s.calculoVacaciones.diasAnticipados === 1 ? '' : 's'}`}
                  </p>
                )}
                {s.contrapropuestaRechazada && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2.5 text-xs">
                    <X className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                      <p className="font-medium">
                        El colaborador rechazó la contrapropuesta (fechas {s.contrapropuestaRechazada.fechaInicio} a {s.contrapropuestaRechazada.fechaFin})
                      </p>
                      {s.contrapropuestaRechazada.respuesta && (
                        <p className="text-muted-foreground">&ldquo;{s.contrapropuestaRechazada.respuesta}&rdquo;</p>
                      )}
                      <p className="text-muted-foreground">La solicitud vuelve con las fechas originales: aprueba, rechaza o propón otras fechas.</p>
                    </div>
                  </div>
                )}
                {s.calculoVacaciones && s.calculoVacaciones.advertencias.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <ul className="space-y-1">
                      {s.calculoVacaciones.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {s.licenciaDerecho && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-2.5 text-xs">
                    <Scale className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-medium">Licencia de ley: no se aprueba ni se niega.</p>
                      <p className="text-muted-foreground">{s.licenciaFundamento}</p>
                      <p className="text-muted-foreground">Valida el soporte y regístrala. Si el soporte no acredita el hecho, devuélvela explicando qué falta.</p>
                    </div>
                  </div>
                )}
                {s.documentos.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {s.documentos.map((d) =>
                      d.esImagen ? (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setImagenAmpliada(d)}
                          className="group/img overflow-hidden rounded-lg border bg-muted/30 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={`${d.nombre} — clic para ampliar`}
                        >
                          {/* La caja es pequeña pero la imagen se ve completa (object-contain). */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/documentos/${d.id}`}
                            alt={d.nombre}
                            className="h-28 w-36 object-contain transition-transform group-hover/img:scale-105"
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        // El soporte se abre aquí mismo: quien está aprobando no
                        // debería perder la bandeja para mirar un adjunto. Las
                        // imágenes ya se ampliaban en la página; faltaban los PDF.
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
                )}
                {s.tipo === 'PERMISO' && !s.licenciaDerecho && cambioFechas !== s.pasoId && (
                  <div className="mt-2">{toggleComprobante(s.pasoId)}</div>
                )}
              </div>
            </div>
            )}

            {/* Formulario de cambio de fechas (solo el jefe inmediato).
                Permiso: aprueba con otro día de una vez. Vacaciones: envía una
                contrapropuesta que el colaborador acepta o rechaza (RIT art. 29 lit. c). */}
            {cambioFechas === s.pasoId ? (
              <div className="mt-3 rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">{s.tipo === 'PERMISO' ? 'Aprobar proponiendo otro día' : 'Proponer otras fechas'}</p>
                {s.tipo === 'VACACIONES' && (
                  <p className="text-xs text-muted-foreground">
                    El colaborador recibirá la propuesta y deberá aceptarla o rechazarla antes de que la solicitud continúe.
                  </p>
                )}
                {s.tipo === 'PERMISO' ? (
                  <div className="space-y-1.5"><Label>Nuevo día</Label><Input type="date" value={nuevaIni} onChange={(e) => setNuevaIni(e.target.value)} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Nueva fecha inicio</Label><Input type="date" value={nuevaIni} onChange={(e) => setNuevaIni(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Nueva fecha fin</Label><Input type="date" value={nuevaFin} onChange={(e) => setNuevaFin(e.target.value)} /></div>
                  </div>
                )}
                <Textarea rows={2} placeholder="Comentario para el colaborador (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
                {s.tipo === 'PERMISO' && toggleComprobante(s.pasoId)}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setCambioFechas(null); setNuevaIni(''); setNuevaFin('') }}>Cancelar</Button>
                  {s.tipo === 'VACACIONES' ? (
                    <Button size="sm" onClick={() => contraproponer(s.pasoId)} disabled={procesando === s.pasoId || !nuevaIni || !nuevaFin}>
                      {procesando === s.pasoId ? <Spinner /> : <CalendarClock className="size-4" />} Enviar contrapropuesta
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => resolver(s.pasoId, true, true)} disabled={procesando === s.pasoId || (!nuevaIni && !nuevaFin)}>
                      {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Aprobar con estas fechas
                    </Button>
                  )}
                </div>
              </div>
            ) : soporteInvalido === s.pasoId ? (
              <div className="mt-3 space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Devolver por soporte insuficiente</p>
                <p className="text-xs text-muted-foreground">
                  No estás negando la licencia —es un derecho—, estás pidiendo el soporte que la acredite. El colaborador podrá volver a reportarla.
                </p>
                <Textarea rows={2} placeholder="¿Qué falta o qué no acredita el soporte?" value={comentario} onChange={(e) => setComentario(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setSoporteInvalido(null); setComentario('') }}>Cancelar</Button>
                  <Button size="sm" variant="outline" onClick={() => devolverPorSoporte(s.pasoId)} disabled={procesando === s.pasoId || !comentario.trim()}>
                    {procesando === s.pasoId ? <Spinner /> : <X className="size-4" />} Devolver
                  </Button>
                </div>
              </div>
            ) : s.licenciaDerecho ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSoporteInvalido(s.pasoId); setComentario('') }} disabled={procesando === s.pasoId}>
                  <X className="size-4" /> Soporte no válido
                </Button>
                <Button size="sm" onClick={() => registrarLicencia(s.pasoId)} disabled={procesando === s.pasoId}>
                  {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Validar y registrar
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => resolver(s.pasoId, false)} disabled={procesando === s.pasoId}>
                  <X className="size-4" /> Rechazar
                </Button>
                {/* Permiso: solo el jefe cambia el día. Vacaciones: cualquier aprobador
                    del paso puede contraproponer fechas (el backend valida quién puede). */}
                {(s.tipo === 'VACACIONES' || (s.esPasoJefe && s.tipo === 'PERMISO')) && (
                  <Button
                    size="sm" variant="outline" disabled={procesando === s.pasoId}
                    onClick={() => { setCambioFechas(s.pasoId); setNuevaIni(s.fechaInicio); setNuevaFin(s.fechaFin) }}
                    aria-label={s.tipo === 'VACACIONES' ? 'Proponer otras fechas' : 'Aprobar con otro día'}
                    title={s.tipo === 'VACACIONES' ? 'Proponer otras fechas' : 'Aprobar con otro día'}
                  >
                    {/* En el celular solo el icono: con texto, los tres botones no cabían en una fila. */}
                    <CalendarClock className="size-4" /> <span className="hidden sm:inline">{s.tipo === 'VACACIONES' ? 'Otras fechas' : 'Otro día'}</span>
                  </Button>
                )}
                {s.esCertFinal ? (
                  <Button size="sm" onClick={() => setCertDe(s)} disabled={procesando === s.pasoId}>
                    <FilePenLine className="size-4" /> Emitir certificación
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => resolver(s.pasoId, true)} disabled={procesando === s.pasoId}>
                    {procesando === s.pasoId ? <Spinner /> : <Check className="size-4" />} Aprobar
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        )
      })}

      {certDe && <DialogCertificacion solicitud={certDe} onClose={() => setCertDe(null)} onDone={() => { setCertDe(null); router.refresh() }} />}

      {/* Ampliación del soporte de imagen, sin salir de la bandeja. */}
      <Dialog open={imagenAmpliada !== null} onOpenChange={(o) => { if (!o) setImagenAmpliada(null) }}>
        <DialogContent className="max-w-[calc(100%-2.5rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-base">{imagenAmpliada?.nombre}</DialogTitle>
          </DialogHeader>
          {imagenAmpliada && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/documentos/${imagenAmpliada.id}`}
              alt={imagenAmpliada.nombre}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DialogCertificacion({ solicitud, onClose, onDone }: { solicitud: Solicitud; onClose: () => void; onDone: () => void }) {
  const [modo, setModo] = useState<'GENERAR' | 'SUBIR'>('GENERAR')
  const [firma, setFirma] = useState<string | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function emitir() {
    setG(true)
    try {
      if (modo === 'GENERAR') {
        const res = await emitirCertificacion({ pasoId: solicitud.pasoId, modo: 'GENERAR', firmaDataUri: firma ?? undefined })
        if (!res.ok) { toast.error(res.error); setG(false); return }
        toast.success('Certificación emitida y enviada al colaborador.')
        window.open(`/api/documentos/${(res.datos as { documentoId: string }).documentoId}`, '_blank')
      } else {
        if (!archivo) { toast.error('Selecciona el archivo del certificado.'); setG(false); return }
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'Colaborador')
        fd.append('entidadId', solicitud.colaboradorId)
        fd.append('nombre', 'Certificación laboral')
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (!up.ok) { toast.error('No se pudo subir el certificado.'); setG(false); return }
        const { id: documentoId } = await up.json()
        const res = await emitirCertificacion({ pasoId: solicitud.pasoId, modo: 'SUBIR', documentoId })
        if (!res.ok) { toast.error(res.error); setG(false); return }
        toast.success('Certificación enviada al colaborador.')
      }
      setG(false)
      onDone()
    } catch { setG(false); toast.error('No se pudo emitir la certificación.') }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir certificación</DialogTitle>
          <DialogDescription>Genera el certificado membretado (con firma opcional) o sube uno ya elaborado. Se enviará a {solicitud.colaborador}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant={modo === 'GENERAR' ? 'default' : 'outline'} onClick={() => setModo('GENERAR')}>Generar</Button>
            <Button type="button" size="sm" variant={modo === 'SUBIR' ? 'default' : 'outline'} onClick={() => setModo('SUBIR')}>Subir</Button>
          </div>
          {modo === 'GENERAR' ? (
            <div className="space-y-1.5">
              <Label>Firma digital (opcional)</Label>
              <FirmaCaptura onChange={setFirma} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Archivo del certificado (PDF o imagen)</Label>
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Dejar para luego</Button>
          <Button onClick={emitir} disabled={g}>{g && <Spinner />} Emitir y enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, Scale, Info, TreePalm, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Calendar } from '@/components/ui/calendar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LICENCIAS, defLicencia, type TipoLicencia } from '@/lib/licencias'
import { festivosDeRango, esDiaHabil } from '@/lib/dias-habiles'
import { parseFechaISO } from '@/lib/fechas'
import { crearSolicitud } from './acciones'

export type TipoSol = 'VACACIONES' | 'PERMISO' | 'INCAPACIDAD' | 'CERTIFICACION_LABORAL' | 'LICENCIA'

const ETIQUETA_TIPO: Record<TipoSol, string> = {
  VACACIONES: 'Vacaciones',
  PERMISO: 'Permiso',
  INCAPACIDAD: 'Incapacidad',
  LICENCIA: 'Licencia',
  CERTIFICACION_LABORAL: 'Certificación laboral',
}

const TIPOS_INCAP = [
  { v: 'ENFERMEDAD_GENERAL', l: 'Enfermedad general' },
  { v: 'ACCIDENTE_TRABAJO', l: 'Accidente de trabajo' },
  { v: 'ENFERMEDAD_LABORAL', l: 'Enfermedad laboral' },
  { v: 'LICENCIA_MATERNIDAD', l: 'Licencia de maternidad' },
  { v: 'LICENCIA_PATERNIDAD', l: 'Licencia de paternidad' },
]

/** Date → "yyyy-mm-dd" usando los componentes locales (fecha pura). */
function toISO(d?: Date): string {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Días hábiles del rango [ini, fin] inclusive. Estimación en cliente; el servidor recalcula el valor definitivo. */
function diasHabilesInclusivo(iniISO: string, finISO: string): number {
  const ini = parseFechaISO(iniISO)
  const fin = parseFechaISO(finISO)
  if (!ini || !fin || fin < ini) return 0
  const festivos = festivosDeRango(ini.getUTCFullYear(), fin.getUTCFullYear())
  let conteo = 0
  for (const d = new Date(ini); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    if (esDiaHabil(d, festivos)) conteo++
  }
  return conteo
}

/**
 * Diálogo de nueva solicitud. Se monta ya abierto y en el trámite que eligió el
 * colaborador desde su tile; el padre lo desmonta al cerrar, así el formulario
 * arranca limpio en cada trámite sin necesidad de resetear a mano.
 */
export function NuevaSolicitud({ tipoInicial, saldoVacaciones, onClose }: { tipoInicial: TipoSol; saldoVacaciones?: number; onClose: () => void }) {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const tipo = tipoInicial
  const [g, setG] = useState(false)

  // Vacaciones (rango)
  const [vacIni, setVacIni] = useState('')
  const [vacFin, setVacFin] = useState('')
  const [autorizaAnticipadas, setAutorizaAnticipadas] = useState(false)
  const diasVac = useMemo(() => diasHabilesInclusivo(vacIni, vacFin), [vacIni, vacFin])
  const saldoVac = saldoVacaciones ?? 0
  const vacAnticipadas = tipo === 'VACACIONES' && diasVac > 0 && diasVac > saldoVac
  // Permiso (un solo día)
  const [permFecha, setPermFecha] = useState<Date | undefined>()
  const [permModo, setPermModo] = useState<'DIA' | 'HORAS'>('DIA')
  const [permIni, setPermIni] = useState('08:00')
  const [permFin, setPermFin] = useState('12:00')
  // Incapacidad (rango)
  const [incaIni, setIncaIni] = useState('')
  const [incaFin, setIncaFin] = useState('')
  const [incaTipo, setIncaTipo] = useState('ENFERMEDAD_GENERAL')
  const [entidad, setEntidad] = useState('')
  // Licencia (rango + tipo)
  const [licTipo, setLicTipo] = useState<TipoLicencia | ''>('')
  const [licIni, setLicIni] = useState('')
  const [licFin, setLicFin] = useState('')
  // Comunes
  const [motivo, setMotivo] = useState('')
  const [certTipo, setCertTipo] = useState('')
  const [dirigidaA, setDirigidaA] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)

  /** Definición de la licencia elegida (null si aún no elige). */
  const lic = licTipo ? defLicencia(licTipo) : null

  function validar(): string | null {
    if (tipo === 'VACACIONES') {
      if (!vacIni || !vacFin) return 'Indica la fecha de inicio y fin de tus vacaciones.'
      if (vacFin < vacIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (vacAnticipadas && !autorizaAnticipadas) return 'Para pedir vacaciones anticipadas debes autorizar el descuento en caso de retiro.'
    } else if (tipo === 'PERMISO') {
      if (!permFecha) return 'Selecciona el día del permiso en el calendario.'
      if (permModo === 'HORAS' && permIni >= permFin) return 'La hora de inicio debe ser anterior a la hora de fin.'
    } else if (tipo === 'INCAPACIDAD') {
      if (!incaIni || !incaFin) return 'Indica las fechas de inicio y fin de la incapacidad.'
      if (incaFin < incaIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (!archivo) return 'Adjunta el soporte de la incapacidad (obligatorio).'
    } else if (tipo === 'LICENCIA') {
      if (!lic) return 'Selecciona el tipo de licencia.'
      if (!licIni || !licFin) return 'Indica las fechas de inicio y fin de la licencia.'
      if (licFin < licIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (lic.requiereSoporte && !archivo) return `Adjunta el soporte: ${lic.soporteEsperado}`
    } else if (tipo === 'CERTIFICACION_LABORAL') {
      if (!certTipo) return 'Selecciona el tipo de certificación.'
    }
    return null
  }

  function payload(): Parameters<typeof crearSolicitud>[0] {
    if (tipo === 'VACACIONES') return {
      tipo, fechaInicio: vacIni, fechaFin: vacFin,
      ...(vacAnticipadas ? { autorizaDescuentoAnticipadas: true } : {}),
    }
    if (tipo === 'PERMISO') return {
      tipo, fechaInicio: toISO(permFecha), permisoTipo: permModo, motivo: motivo || undefined,
      ...(permModo === 'HORAS' ? { horaInicio: permIni, horaFin: permFin } : {}),
    }
    if (tipo === 'INCAPACIDAD') return {
      tipo, fechaInicio: incaIni, fechaFin: incaFin, incapacidadTipo: incaTipo as 'ENFERMEDAD_GENERAL',
      entidad: entidad || undefined, motivo: motivo || undefined,
    }
    if (tipo === 'LICENCIA') return {
      tipo, licenciaTipo: licTipo as TipoLicencia, fechaInicio: licIni, fechaFin: licFin,
      motivo: motivo || undefined,
    }
    return { tipo, tipoCertificacion: certTipo as 'SIMPLE', dirigidaA: dirigidaA || undefined }
  }

  async function enviar() {
    const err = validar()
    if (err) { toast.error(err); return }
    setG(true)
    const res = await crearSolicitud(payload())
    if (!res.ok) { setG(false); toast.error(res.error); return }
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'Solicitud')
        fd.append('entidadId', (res.datos as { id: string }).id)
        fd.append('nombre', `Soporte solicitud — ${archivo.name}`)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (!up.ok) toast.warning('La solicitud se creó, pero el soporte no se pudo adjuntar. Intenta subirlo de nuevo o avisa a Talento Humano.')
      } catch {
        toast.warning('La solicitud se creó, pero el soporte no se pudo adjuntar. Intenta subirlo de nuevo o avisa a Talento Humano.')
      }
    }
    setG(false)
    toast.success(
      tipo === 'INCAPACIDAD' ? 'Incapacidad enviada a Talento Humano.'
        : lic?.derecho ? 'Licencia reportada. Talento Humano valida el soporte y la registra; no requiere aprobación.'
        : 'Solicitud enviada. Quedó en aprobación de tu jefe inmediato.',
    )
    onClose(); router.refresh()
  }

  const permiteAdjunto = tipo === 'PERMISO' || tipo === 'VACACIONES' || tipo === 'INCAPACIDAD' || tipo === 'LICENCIA'
  const adjuntoObligatorio = tipo === 'INCAPACIDAD' || (tipo === 'LICENCIA' && !!lic?.requiereSoporte)

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud — {ETIQUETA_TIPO[tipo]}</DialogTitle>
            <DialogDescription>
              {tipo === 'INCAPACIDAD'
                ? 'La incapacidad la valida y registra Talento Humano. Recibirás notificaciones.'
                : lic?.derecho
                  ? 'Esta licencia te la concede la ley: Talento Humano solo valida el soporte y la registra.'
                  : 'La revisa primero tu jefe inmediato y luego Talento Humano. Recibirás notificaciones en cada paso.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-0.5">
            {tipo === 'VACACIONES' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={vacIni} onChange={(e) => setVacIni(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={vacFin} onChange={(e) => setVacFin(e.target.value)} /></div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border p-3 text-xs">
                  <TreePalm className="size-4 shrink-0 text-emerald-600" />
                  <p>
                    Tienes <strong>{saldoVac} día{saldoVac === 1 ? '' : 's'} hábiles</strong> de vacaciones disponibles.
                    {diasVac > 0 && <> Estás pidiendo <strong>{diasVac} día{diasVac === 1 ? '' : 's'} hábiles</strong>.</>}
                  </p>
                </div>

                {vacAnticipadas && (
                  <div className="space-y-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="font-medium">Vacaciones anticipadas</p>
                        <p className="text-muted-foreground">
                          Estás pidiendo {diasVac - saldoVac} día{diasVac - saldoVac === 1 ? '' : 's'} más de los que has causado.
                          La empresa puede concederlas como anticipo, con tu autorización escrita.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-start gap-2">
                      <Checkbox checked={autorizaAnticipadas} onCheckedChange={(v) => setAutorizaAnticipadas(Boolean(v))} className="mt-0.5" />
                      <span>
                        Autorizo por escrito que, si me retiro antes de causar estos días, su valor se descuente de mi
                        liquidación definitiva (RIT art. 69 num. 4)
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}

            {tipo === 'PERMISO' && (
              <>
                <div className="space-y-1.5">
                  <Label>Día del permiso</Label>
                  <div className="flex justify-center rounded-lg border">
                    <Calendar mode="single" selected={permFecha} onSelect={setPermFecha} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de permiso</Label>
                  <RadioGroup value={permModo} onValueChange={(v) => setPermModo(v as 'DIA' | 'HORAS')} className="flex gap-6">
                    <div className="flex items-center gap-2"><RadioGroupItem value="DIA" id="p-dia" /><Label htmlFor="p-dia" className="font-normal">Día entero</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="HORAS" id="p-horas" /><Label htmlFor="p-horas" className="font-normal">Por horas</Label></div>
                  </RadioGroup>
                </div>
                {permModo === 'HORAS' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Desde</Label><Input type="time" value={permIni} onChange={(e) => setPermIni(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Hasta</Label><Input type="time" value={permFin} onChange={(e) => setPermFin(e.target.value)} /></div>
                  </div>
                )}
                <div className="space-y-1.5"><Label>Motivo</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
              </>
            )}

            {tipo === 'INCAPACIDAD' && (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de incapacidad</Label>
                  <Select value={incaTipo} onValueChange={setIncaTipo}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_INCAP.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={incaIni} onChange={(e) => setIncaIni(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={incaFin} onChange={(e) => setIncaFin(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Entidad (EPS/ARL) — opcional</Label><Input value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder="Quién la expide" /></div>
                <div className="space-y-1.5"><Label>Observaciones (opcional)</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
              </>
            )}

            {tipo === 'LICENCIA' && (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de licencia</Label>
                  <Select value={licTipo} onValueChange={(v) => { setLicTipo(v as TipoLicencia); setArchivo(null) }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Que te concede la ley</SelectLabel>
                        {LICENCIAS.filter((l) => l.derecho).map((l) => <SelectItem key={l.tipo} value={l.tipo}>{l.label}</SelectItem>)}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Que decide la empresa</SelectLabel>
                        {LICENCIAS.filter((l) => !l.derecho).map((l) => <SelectItem key={l.tipo} value={l.tipo}>{l.label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {lic && (
                  <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${lic.derecho ? 'border-emerald-600/30 bg-emerald-600/5' : 'bg-muted/40'}`}>
                    {lic.derecho
                      ? <Scale className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    <div className="space-y-1">
                      <p className="font-medium">
                        {lic.derecho
                          ? 'Es un derecho tuyo: no se aprueba ni se niega.'
                          : 'La autoriza tu jefe inmediato.'}
                      </p>
                      <p className="text-muted-foreground">{lic.fundamento}</p>
                      <p className="text-muted-foreground">
                        {lic.derecho
                          ? 'Talento Humano solo valida el soporte y la registra. A tu jefe se le avisa para que organice el trabajo del área.'
                          : 'No la concede la ley, así que tu jefe puede autorizarla o no.'}
                        {' '}Es <strong>{lic.remunerada ? 'remunerada' : 'no remunerada'}</strong>
                        {lic.diasLey ? ` y la ley fija ${lic.diasLey} día(s).` : '.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={licIni} onChange={(e) => setLicIni(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={licFin} onChange={(e) => setLicFin(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo {lic?.derecho ? '(opcional)' : ''}</Label>
                  <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={lic?.derecho ? 'Cuéntanos lo que necesites; no es obligatorio.' : 'Explica por qué la necesitas.'} />
                </div>
              </>
            )}

            {tipo === 'CERTIFICACION_LABORAL' && (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de certificación</Label>
                  <Select value={certTipo} onValueChange={setCertTipo}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SIMPLE">Simple (cargo y fechas)</SelectItem>
                      <SelectItem value="CON_SALARIO">Con salario</SelectItem>
                      <SelectItem value="CON_FUNCIONES">Con funciones</SelectItem>
                      <SelectItem value="ENTIDAD_FINANCIERA">Para entidad financiera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Dirigida a (opcional)</Label><Input value={dirigidaA} onChange={(e) => setDirigidaA(e.target.value)} placeholder="Banco, entidad…" /></div>
              </>
            )}

            {permiteAdjunto && (
              <div className="space-y-1.5">
                <Label>Soporte {adjuntoObligatorio ? '(obligatorio)' : '(opcional)'}</Label>
                {tipo === 'LICENCIA' && lic && lic.soporteEsperado !== '—' && (
                  <p className="text-xs text-muted-foreground">{lic.soporteEsperado}</p>
                )}
                <input ref={inputArchivo} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
                  <Paperclip className="size-4" /> {archivo ? archivo.name : 'Adjuntar imagen o PDF'}
                </Button>
                {adjuntoObligatorio && !archivo && (
                  <p className="text-xs text-destructive">
                    {tipo === 'INCAPACIDAD' ? 'Debes adjuntar el soporte de la incapacidad.' : 'Debes adjuntar el soporte de la licencia.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={enviar} disabled={g}>{g && <Spinner />}Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

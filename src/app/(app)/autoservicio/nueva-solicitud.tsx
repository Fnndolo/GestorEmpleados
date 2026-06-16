'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Calendar } from '@/components/ui/calendar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearSolicitud } from './acciones'

type TipoSol = 'VACACIONES' | 'PERMISO' | 'INCAPACIDAD' | 'CERTIFICACION_LABORAL'

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

export function NuevaSolicitud() {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoSol>('VACACIONES')
  const [g, setG] = useState(false)

  // Vacaciones (rango)
  const [vacIni, setVacIni] = useState('')
  const [vacFin, setVacFin] = useState('')
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
  // Comunes
  const [motivo, setMotivo] = useState('')
  const [certTipo, setCertTipo] = useState('')
  const [dirigidaA, setDirigidaA] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)

  function reset() {
    setVacIni(''); setVacFin(''); setPermFecha(undefined); setPermModo('DIA'); setPermIni('08:00'); setPermFin('12:00')
    setIncaIni(''); setIncaFin(''); setIncaTipo('ENFERMEDAD_GENERAL'); setEntidad('')
    setMotivo(''); setCertTipo(''); setDirigidaA(''); setArchivo(null)
  }

  function validar(): string | null {
    if (tipo === 'VACACIONES') {
      if (!vacIni || !vacFin) return 'Indica la fecha de inicio y fin de tus vacaciones.'
    } else if (tipo === 'PERMISO') {
      if (!permFecha) return 'Selecciona el día del permiso en el calendario.'
      if (permModo === 'HORAS' && permIni >= permFin) return 'La hora de inicio debe ser anterior a la hora de fin.'
    } else if (tipo === 'INCAPACIDAD') {
      if (!incaIni || !incaFin) return 'Indica las fechas de inicio y fin de la incapacidad.'
      if (incaFin < incaIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (!archivo) return 'Adjunta el soporte de la incapacidad (obligatorio).'
    } else if (tipo === 'CERTIFICACION_LABORAL') {
      if (!certTipo) return 'Selecciona el tipo de certificación.'
    }
    return null
  }

  function payload(): Parameters<typeof crearSolicitud>[0] {
    if (tipo === 'VACACIONES') return { tipo, fechaInicio: vacIni, fechaFin: vacFin }
    if (tipo === 'PERMISO') return {
      tipo, fechaInicio: toISO(permFecha), permisoTipo: permModo, motivo: motivo || undefined,
      ...(permModo === 'HORAS' ? { horaInicio: permIni, horaFin: permFin } : {}),
    }
    if (tipo === 'INCAPACIDAD') return {
      tipo, fechaInicio: incaIni, fechaFin: incaFin, incapacidadTipo: incaTipo as 'ENFERMEDAD_GENERAL',
      entidad: entidad || undefined, motivo: motivo || undefined,
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
        await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      } catch { /* el soporte se reintenta luego si falla */ }
    }
    setG(false)
    toast.success(tipo === 'INCAPACIDAD' ? 'Incapacidad enviada a Talento Humano.' : 'Solicitud enviada. Quedó en aprobación de tu jefe inmediato.')
    setAbierto(false); reset(); router.refresh()
  }

  const permiteAdjunto = tipo === 'PERMISO' || tipo === 'VACACIONES' || tipo === 'INCAPACIDAD'
  const adjuntoObligatorio = tipo === 'INCAPACIDAD'

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva solicitud</Button>
      <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud</DialogTitle>
            <DialogDescription>
              {tipo === 'INCAPACIDAD'
                ? 'La incapacidad la valida y registra Talento Humano. Recibirás notificaciones.'
                : 'La revisa primero tu jefe inmediato y luego Talento Humano. Recibirás notificaciones en cada paso.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-0.5">
            <div className="space-y-1.5">
              <Label>Tipo de solicitud</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoSol); setArchivo(null) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VACACIONES">Vacaciones</SelectItem>
                  <SelectItem value="PERMISO">Permiso</SelectItem>
                  <SelectItem value="INCAPACIDAD">Incapacidad</SelectItem>
                  <SelectItem value="CERTIFICACION_LABORAL">Certificación laboral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === 'VACACIONES' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={vacIni} onChange={(e) => setVacIni(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={vacFin} onChange={(e) => setVacFin(e.target.value)} /></div>
              </div>
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
                <input ref={inputArchivo} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
                  <Paperclip className="size-4" /> {archivo ? archivo.name : 'Adjuntar imagen o PDF'}
                </Button>
                {adjuntoObligatorio && !archivo && <p className="text-xs text-destructive">Debes adjuntar el soporte de la incapacidad.</p>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAbierto(false); reset() }}>Cancelar</Button>
            <Button onClick={enviar} disabled={g}>{g && <Spinner />}Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

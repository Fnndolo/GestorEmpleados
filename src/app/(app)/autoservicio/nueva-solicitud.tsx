'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, Scale, Info, CalendarRange, TriangleAlert, CalendarDays, X, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { es } from 'date-fns/locale'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LICENCIAS, defLicencia, type TipoLicencia } from '@/lib/licencias'
import { festivosDeRango, esDiaHabil } from '@/lib/dias-habiles'
import { parseFechaISO } from '@/lib/fechas'
import { crearSolicitud, editarMiPermiso } from './acciones'
import { textoAutorizacionAnticipadas } from '@/lib/vacaciones-config'
import { horasEntreHoras, DIAS_HABILES_POSTERIOR, LIMITE_HORAS_EXTRA_DIA, SOPORTE_HORAS_EXTRA_OBLIGATORIO } from '@/lib/horas-extra-solicitud'

/** Lo que hace falta para abrir el diálogo con un permiso ya pedido y corregirlo. */
export type EdicionPermiso = {
  solicitudId: string
  fechaInicio: string
  permisoTipo: 'DIA' | 'HORAS'
  horaInicio?: string
  horaFin?: string
  motivo?: string
}

export type TipoSol = 'VACACIONES' | 'PERMISO' | 'HORAS_EXTRA' | 'INCAPACIDAD' | 'CERTIFICACION_LABORAL' | 'LICENCIA'

const ETIQUETA_TIPO: Record<TipoSol, string> = {
  HORAS_EXTRA: 'Horas extra',
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
]

/** "lunes, 15 de septiembre de 2026", con los componentes locales de la fecha. */
function fechaLargaLocal(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

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

/** "1 día hábil", "3 días hábiles". */
function diasHabilesTexto(n: number): string {
  return n === 1 ? '1 día hábil' : `${n} días hábiles`
}

/** Lo que devuelve el servidor cuando la solicitud necesita la autorización de anticipadas. */
type PedidoAutorizacion = { dias: number; saldo: number | null; diasAnticipados: number | null }

/**
 * Diálogo de nueva solicitud. Se monta ya abierto y en el trámite que eligió el
 * colaborador desde su tile; el padre lo desmonta al cerrar, así el formulario
 * arranca limpio en cada trámite sin necesidad de resetear a mano.
 */
export function NuevaSolicitud({ tipoInicial, saldoVacaciones, mostrarSaldo = false, bloqueoPermiso, edicion, onClose }: {
  tipoInicial: TipoSol
  saldoVacaciones?: number
  /**
   * Si su saldo es confiable (Talento Humano ya cargó su historial): se le
   * muestra y se compara contra él. Si no, se muestra "—" y es el servidor el
   * que avisa cuando lo pedido excede lo causado. Ver vacaciones-config.ts.
   */
  mostrarSaldo?: boolean
  /**
   * Permiso cuyo comprobante venció sin entregarse (fechas ya formateadas):
   * mientras exista no se puede pedir otro permiso. El servidor lo exige igual;
   * aquí se explica antes de que llene el formulario.
   */
  bloqueoPermiso?: { fecha: string; vence: string } | null
  /** Con esto el diálogo edita un permiso ya pedido en vez de crear uno. */
  edicion?: EdicionPermiso
  onClose: () => void
}) {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const tipo = tipoInicial
  const [g, setG] = useState(false)

  // Vacaciones (rango)
  const [vacIni, setVacIni] = useState('')
  const [vacFin, setVacFin] = useState('')
  const [autorizaAnticipadas, setAutorizaAnticipadas] = useState(false)
  // El servidor pidió la autorización (lo pedido excede lo causado según sus
  // cuentas). Se descarta si cambian las fechas: la cifra ya no aplica.
  const [pedidoAutorizacion, setPedidoAutorizacion] = useState<PedidoAutorizacion | null>(null)
  const cambiarFechasVac = (ini: string, fin: string) => {
    setVacIni(ini); setVacFin(fin)
    setPedidoAutorizacion(null); setAutorizaAnticipadas(false)
  }
  const diasVac = useMemo(() => diasHabilesInclusivo(vacIni, vacFin), [vacIni, vacFin])
  const saldoVac = saldoVacaciones ?? 0
  // Con el saldo confiable se sabe de antemano; sin él, lo dice el servidor al enviar.
  const excedeSaldo = mostrarSaldo && tipo === 'VACACIONES' && diasVac > 0 && diasVac > saldoVac
  const vacAnticipadas = excedeSaldo || pedidoAutorizacion !== null
  // Solo los días de esta solicitud: si ya debía días (saldo negativo), no se suman.
  const diasAnticipadosVac = excedeSaldo ? diasVac - Math.max(saldoVac, 0) : (pedidoAutorizacion?.diasAnticipados ?? null)
  // Permiso (un solo día)
  const [permFecha, setPermFecha] = useState<Date | undefined>(() => {
    const m = edicion && /^(\d{4})-(\d{2})-(\d{2})$/.exec(edicion.fechaInicio)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
  })
  const [permCalAbierto, setPermCalAbierto] = useState(false)
  const [permModo, setPermModo] = useState<'DIA' | 'HORAS'>(edicion?.permisoTipo ?? 'DIA')
  // Horas extra: mismo día que el permiso (permFecha), su propio horario.
  const [heIni, setHeIni] = useState('18:00')
  const [heFin, setHeFin] = useState('20:00')
  const horasHe = horasEntreHoras(heIni, heFin)
  // Se pueden pedir antes o hasta 3 días hábiles después (el servidor lo exige igual).
  const minimaHe = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const festivos = festivosDeRango(hoy.getFullYear() - 1, hoy.getFullYear())
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
    let n = DIAS_HABILES_POSTERIOR
    while (n > 0) { d.setUTCDate(d.getUTCDate() - 1); if (esDiaHabil(d, festivos)) n-- }
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }, [])
  const heDespues = !!permFecha && permFecha < new Date(new Date().setHours(0, 0, 0, 0))
  const [permIni, setPermIni] = useState(edicion?.horaInicio ?? '08:00')
  const [permFin, setPermFin] = useState(edicion?.horaFin ?? '12:00')
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
  const [motivo, setMotivo] = useState(edicion?.motivo ?? '')
  const [certTipo, setCertTipo] = useState('')
  const [dirigidaA, setDirigidaA] = useState('')
  // Varios soportes: un permiso puede llevar la cita y la constancia, una
  // incapacidad las dos caras del formato. Se suben uno a uno tras crear la solicitud.
  const [archivos, setArchivos] = useState<File[]>([])
  const agregarArchivos = (lista: FileList | null) => {
    if (!lista?.length) return
    setArchivos((prev) => [...prev, ...Array.from(lista)])
  }

  /** Definición de la licencia elegida (null si aún no elige). */
  const lic = licTipo ? defLicencia(licTipo) : null

  function validar(): string | null {
    if (tipo === 'VACACIONES') {
      if (!vacIni || !vacFin) return 'Indica la fecha de inicio y fin de tus vacaciones.'
      if (vacFin < vacIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (vacAnticipadas && !autorizaAnticipadas) return 'Para pedir vacaciones anticipadas debes autorizar el descuento en caso de retiro.'
    } else if (tipo === 'HORAS_EXTRA') {
      if (!permFecha) return 'Elige el día de las horas extra.'
      if (heIni >= heFin) return 'La hora de inicio debe ser anterior a la hora de fin.'
      if (!motivo.trim()) return 'Escribe el motivo de las horas extra.'
      if (SOPORTE_HORAS_EXTRA_OBLIGATORIO && archivos.length === 0) return 'Adjunta el soporte que justifica las horas extra (obligatorio).'
    } else if (tipo === 'PERMISO') {
      if (!permFecha) return 'Selecciona el día del permiso en el calendario.'
      if (permModo === 'HORAS' && permIni >= permFin) return 'La hora de inicio debe ser anterior a la hora de fin.'
    } else if (tipo === 'INCAPACIDAD') {
      if (!incaIni || !incaFin) return 'Indica las fechas de inicio y fin de la incapacidad.'
      if (incaFin < incaIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (archivos.length === 0) return 'Adjunta el soporte de la incapacidad (obligatorio).'
    } else if (tipo === 'LICENCIA') {
      if (!lic) return 'Selecciona el tipo de licencia.'
      if (!licIni || !licFin) return 'Indica las fechas de inicio y fin de la licencia.'
      if (licFin < licIni) return 'La fecha de fin no puede ser anterior a la de inicio.'
      if (lic.requiereSoporte && archivos.length === 0) return `Adjunta el soporte: ${lic.soporteEsperado}`
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
    if (tipo === 'HORAS_EXTRA') return { tipo, fechaInicio: toISO(permFecha), horaInicio: heIni, horaFin: heFin, motivo: motivo.trim() }
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
    // Editar guarda sobre la misma solicitud; los soportes nuevos se le adjuntan igual.
    const res = edicion
      ? await editarMiPermiso({
          solicitudId: edicion.solicitudId, fechaInicio: toISO(permFecha), permisoTipo: permModo, motivo: motivo || undefined,
          ...(permModo === 'HORAS' ? { horaInicio: permIni, horaFin: permFin } : {}),
        })
      : await crearSolicitud(payload())
    if (!res.ok) { setG(false); toast.error(res.error); return }
    // Pide más de lo causado y aún no autorizó: el formulario le muestra la
    // autorización con las cifras del servidor, sin crear la solicitud todavía.
    if (!edicion && 'requiereAutorizacion' in res.datos && res.datos.requiereAutorizacion) {
      setG(false)
      setPedidoAutorizacion(res.datos.requiereAutorizacion)
      toast.info('Estas vacaciones serían anticipadas: revisa y autoriza el descuento para enviarlas.')
      return
    }
    const solicitudId = edicion ? edicion.solicitudId : (res.datos as { id: string }).id
    if (archivos.length > 0) {
      let fallidos = 0
      for (const archivo of archivos) {
        try {
          const fd = new FormData()
          fd.append('archivo', archivo)
          fd.append('entidadTipo', 'Solicitud')
          fd.append('entidadId', solicitudId)
          fd.append('nombre', `Soporte solicitud — ${archivo.name}`)
          const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
          if (!up.ok) fallidos++
        } catch {
          fallidos++
        }
      }
      if (fallidos > 0) {
        toast.warning(
          fallidos === archivos.length
            ? 'La solicitud se creó, pero el soporte no se pudo adjuntar. Intenta subirlo de nuevo o avisa a Talento Humano.'
            : `La solicitud se creó, pero ${fallidos} de ${archivos.length} soportes no se pudieron adjuntar. Avisa a Talento Humano.`,
        )
      }
    }
    setG(false)
    toast.success(
      edicion ? 'Permiso actualizado. Le avisamos a quien lo aprueba.'
        : tipo === 'INCAPACIDAD' ? 'Incapacidad enviada a Talento Humano.'
        : lic?.derecho ? 'Licencia reportada. Talento Humano valida el soporte y la registra; no requiere aprobación.'
        : 'Solicitud enviada. Quedó en aprobación de tu jefe inmediato.',
    )
    onClose(); router.refresh()
  }

  if (tipo === 'PERMISO' && !edicion && bloqueoPermiso) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Aún no puedes pedir otro permiso</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1.5">
              <p>
                Falta el comprobante de asistencia de tu permiso del <strong>{bloqueoPermiso.fecha}</strong>.
                El plazo para subirlo venció el <strong>{bloqueoPermiso.vence}</strong>.
              </p>
              <p className="text-muted-foreground">
                Súbelo desde <strong className="text-foreground">Mi actividad reciente</strong>, aquí mismo en Autoservicio,
                y podrás pedir tu permiso.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const permiteAdjunto = tipo === 'PERMISO' || tipo === 'HORAS_EXTRA' || tipo === 'VACACIONES' || tipo === 'INCAPACIDAD' || tipo === 'LICENCIA'
  const adjuntoObligatorio = tipo === 'INCAPACIDAD' || (tipo === 'HORAS_EXTRA' && SOPORTE_HORAS_EXTRA_OBLIGATORIO) || (tipo === 'LICENCIA' && !!lic?.requiereSoporte)

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        {/* Sin descripción: el paso siguiente (jefe, Talento Humano) lo dice el
            aviso al enviar; aquí solo estorbaba antes de llegar a los campos. */}
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{edicion ? 'Editar permiso' : `Nueva solicitud — ${ETIQUETA_TIPO[tipo]}`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-0.5">
            {tipo === 'VACACIONES' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={vacIni} onChange={(e) => cambiarFechasVac(e.target.value, vacFin)} /></div>
                  <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={vacFin} onChange={(e) => cambiarFechasVac(vacIni, e.target.value)} /></div>
                </div>

                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarRange className="size-4 shrink-0" />
                  <span>
                    {/* Negativo = días tomados anticipados que aún no se causan. */}
                    {mostrarSaldo && saldoVac < 0
                      ? <>Debes <strong className="text-foreground">{diasHabilesTexto(-saldoVac)}</strong> tomados anticipados</>
                      : <>Disponibles: <strong className="text-foreground">{mostrarSaldo ? diasHabilesTexto(saldoVac) : "—"}</strong></>}
                    {diasVac > 0 && <> · Pides <strong className="text-foreground">{diasHabilesTexto(diasVac)}</strong></>}
                  </span>
                </p>

                {vacAnticipadas && (
                  <div className="space-y-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="font-medium">Vacaciones anticipadas</p>
                        <p className="text-muted-foreground">
                          {diasAnticipadosVac
                            ? <>{diasAnticipadosVac === diasVac ? 'Todos los días' : `${diasAnticipadosVac} de los ${diasVac} días`} que pides aún no los has causado. </>
                            : <>Según lo registrado, pides más días de los que has causado. Talento Humano confirmará cuántos al revisar tu historial. </>}
                          La empresa puede concederlas como anticipo, con tu autorización escrita.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-start gap-2">
                      <Checkbox checked={autorizaAnticipadas} onCheckedChange={(v) => setAutorizaAnticipadas(Boolean(v))} className="mt-0.5" />
                      {/* El mismo texto que el servidor guarda como evidencia. */}
                      <span>{textoAutorizacionAnticipadas(diasAnticipadosVac)}</span>
                    </label>
                  </div>
                )}
              </>
            )}

            {tipo === 'PERMISO' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="perm-dia">Día del permiso</Label>
                  {/* El calendario sale al pulsar, no desplegado: abierto ocupaba
                      todo el formulario y escondía el resto de los campos. */}
                  <Popover open={permCalAbierto} onOpenChange={setPermCalAbierto}>
                    <PopoverTrigger asChild>
                      <Button id="perm-dia" type="button" className="w-full justify-start font-normal">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        {permFecha ? fechaLargaLocal(permFecha) : <span className="text-muted-foreground">Elige el día</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={es}
                        selected={permFecha}
                        onSelect={(d) => { setPermFecha(d); if (d) setPermCalAbierto(false) }}
                      />
                    </PopoverContent>
                  </Popover>
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

            {tipo === 'HORAS_EXTRA' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="he-dia">Día</Label>
                  <Popover open={permCalAbierto} onOpenChange={setPermCalAbierto}>
                    <PopoverTrigger asChild>
                      <Button id="he-dia" type="button" className="w-full justify-start font-normal">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        {permFecha ? fechaLargaLocal(permFecha) : <span className="text-muted-foreground">Elige el día</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={es}
                        selected={permFecha}
                        disabled={{ before: minimaHe }}
                        onSelect={(d) => { setPermFecha(d); if (d) setPermCalAbierto(false) }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Desde</Label><Input type="time" value={heIni} onChange={(e) => setHeIni(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Hasta</Label><Input type="time" value={heFin} onChange={(e) => setHeFin(e.target.value)} /></div>
                </div>
                {horasHe > 0 && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-4 shrink-0" />
                    <span>
                      <strong className="text-foreground">{horasHe} h</strong>
                      {permFecha && <> · {heDespues ? 'ya hechas (pedidas después)' : 'por hacer'}</>}
                      {horasHe > LIMITE_HORAS_EXTRA_DIA && <span className="text-amber-700 dark:text-amber-400"> · pasa de {LIMITE_HORAS_EXTRA_DIA} h diarias</span>}
                    </span>
                  </p>
                )}
                <div className="space-y-1.5"><Label>Motivo</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué hay que quedarse?" /></div>
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
                  <Select value={licTipo} onValueChange={(v) => { setLicTipo(v as TipoLicencia); setArchivos([]) }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {LICENCIAS.map((l) => <SelectItem key={l.tipo} value={l.tipo}>{l.label}</SelectItem>)}
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
                      <p className="text-muted-foreground">
                        <strong>{lic.remunerada ? 'Remunerada' : 'No remunerada'}</strong>
                        {lic.diasLey ? ` · ${lic.diasLey} día${lic.diasLey === 1 ? '' : 's'} de ley` : ''}
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
                {/* Sin `capture`: forzaba la cámara y en el celular impedía elegir
                    varios archivos de la galería. La cámara sigue en el selector. */}
                <input ref={inputArchivo} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = '' }} />
                {archivos.length > 0 && (
                  <ul className="space-y-1 rounded-lg border p-2">
                    {archivos.map((a, i) => (
                      <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-xs">
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        <span className="shrink-0 text-muted-foreground">{(a.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-destructive" aria-label={`Quitar ${a.name}`}>
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button type="button" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
                  <Paperclip className="size-4" /> {archivos.length > 0 ? 'Agregar otro archivo' : 'Adjuntar imagen o PDF'}
                </Button>
                {adjuntoObligatorio && archivos.length === 0 && (
                  <p className="text-xs text-destructive">
                    {tipo === 'INCAPACIDAD' ? 'Debes adjuntar el soporte de la incapacidad.' : tipo === 'HORAS_EXTRA' ? 'Debes adjuntar el soporte que justifica las horas extra.' : 'Debes adjuntar el soporte de la licencia.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={enviar} disabled={g}>{g && <Spinner />}{edicion ? 'Guardar cambios' : 'Enviar solicitud'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Coins, BadgeDollarSign, Trash2, Pencil, Ban, ClockPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Chip, Pill } from '@/components/ui-kit'
import { fmtCOP } from '@/lib/moneda'
import {
  registrarComision, editarComision, eliminarComision,
  registrarHoras, editarNovedadHoras, eliminarNovedadHoras,
  registrarNovedadConcepto, editarNovedadConcepto, eliminarNovedadConcepto,
} from '../acciones'
import { DialogMotivo } from '../dialog-motivo'
import { PanelAsistencia } from './asistencia-panel'

export type ColaboradorOpcion = { id: string; nombre: string }
export type ConceptoOpcion = { id: string; nombre: string; tipo: string; valorFijo: number | null }
export type ComisionItem = {
  id: string; colaborador: string; colaboradorId: string; fecha: string; tipo: string; baseCalculo: number; valor: number; descripcion: string | null
  pagadaEn: string | null
  /** La pagó un periodo cerrado: no se cambia ni se borra. */
  periodoCerrado: boolean
}
export type ConceptoNovedadItem = {
  id: string; colaborador: string; colaboradorId: string; fecha: string; conceptoId: string; concepto: string; tipo: string; valor: number
  observaciones: string | null; pagadaEn: string | null; periodoCerrado: boolean
}
export type HorasItem = {
  id: string; colaborador: string; colaboradorId: string; fecha: string; horaInicio: string; horaFin: string; tipoHora: string; horas: number
  observaciones: string | null
  /** Vino de AsistencIA (al recalcular el periodo se vuelve a traer de allá). */
  deAsistencia: boolean
  pagadaEn: string | null; periodoCerrado: boolean
}

const TIPO_CONCEPTO: Record<string, string> = { DEVENGADO: 'Devengado', DEDUCCION: 'Deducción' }
const TIPO_COMISION: Record<string, string> = { VENTA: 'Venta', RECAUDO: 'Recaudo' }

/** Etiquetas legibles de los tipos de hora (Ley 2466: nocturno desde las 7 p.m.). */
const TIPO_HORA: Record<string, string> = {
  HED: 'Extra diurna 25%',
  HEN: 'Extra nocturna 75%',
  RN: 'Recargo nocturno 35%',
  RD: 'Recargo dominical',
  RND: 'Recargo nocturno dominical',
  HEDD: 'Extra diurna dominical',
  HEND: 'Extra nocturna dominical',
}

const BLOQUEO_CERRADO = 'Ya se pagó en un periodo cerrado: se corrige con un periodo de ajuste'

type Props = {
  /** Fecha de hoy en yyyy-mm-dd, para precargar los formularios. */
  hoy: string
  colaboradores: ColaboradorOpcion[]
  conceptos: ConceptoOpcion[]
  comisiones: ComisionItem[]
  conceptosNovedades: ConceptoNovedadItem[]
  horas: HorasItem[]
  /** Conexión con AsistencIA (control de asistencia): de ahí llegan las horas. */
  asistencia: { conectada: boolean; apagada: boolean; url: string | null }
  /** El administrador ve el acceso a Ajustes → Integraciones desde el panel. */
  esAdmin: boolean
  /** Pestaña con la que abre (`?grupo=horas` desde Ajustes → Integraciones). */
  grupoInicial: Grupo
  puedeEditar: boolean
  puedeEliminar: boolean
}

/** `c`: rótulo corto para el celular, donde el largo partía la pestaña en dos líneas. */
const GRUPOS = [
  { v: 'horas', l: 'Horas extra y recargos', c: 'Horas extra' },
  { v: 'comisiones', l: 'Comisiones', c: 'Comisiones' },
  { v: 'conceptos', l: 'Otros conceptos', c: 'Otros' },
] as const
type Grupo = (typeof GRUPOS)[number]['v']

/**
 * Novedades de nómina: comisiones, horas extra/recargos y conceptos aplicados.
 *
 * Viven aquí y no dentro de un periodo porque ocurren cuando ocurren: una
 * comisión de julio se registra el día que se causa, sin esperar a que alguien
 * abra la nómina de julio. El periodo las recoge después por rango de fechas y
 * las marca como pagadas; lo que quede suelto cuando alguien se retira lo recoge
 * su liquidación definitiva.
 */
export function NovedadesNomina(p: Props) {
  const router = useRouter()
  const [grupo, setGrupo] = useState<Grupo>(p.grupoInicial)
  const [dialogo, setDialogo] = useState<Grupo | null>(null)
  const [editandoComision, setEditandoComision] = useState<ComisionItem | null>(null)
  const [anulandoComision, setAnulandoComision] = useState<ComisionItem | null>(null)
  const [editandoHoras, setEditandoHoras] = useState<HorasItem | null>(null)
  const [borrandoHoras, setBorrandoHoras] = useState<HorasItem | null>(null)
  const [editandoConcepto, setEditandoConcepto] = useState<ConceptoNovedadItem | null>(null)
  const [borrandoConcepto, setBorrandoConcepto] = useState<ConceptoNovedadItem | null>(null)

  /** Lo ya liquidado no cambia solo: hay que rehacer el periodo que lo pagó. */
  function recordarRecalculo() {
    router.refresh()
  }

  // Las horas llegan de AsistencIA ("Traer a la nómina"); solo sin esa conexión
  // se digitan a mano, y entonces sí hay "Agregar" en esa pestaña.
  const hayAgregar = grupo !== 'horas' || !p.asistencia.conectada

  return (
    <section>
      {/* Pestañas y "Agregar" en una sola fila (en el celular, "+" solo). */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {GRUPOS.map((g) => (
            <button
              key={g.v}
              type="button"
              onClick={() => setGrupo(g.v)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                grupo === g.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              <span className="sm:hidden">{g.c}</span>
              <span className="hidden sm:inline">{g.l}</span>
            </button>
          ))}
        </div>
        {hayAgregar && (
          <Button size="sm" className="shrink-0" onClick={() => setDialogo(grupo)} aria-label="Agregar" title="Agregar">
            <Plus className="size-4" /> <span className="hidden sm:inline">Agregar</span>
          </Button>
        )}
      </div>

      {grupo === 'comisiones' && (
        p.comisiones.length === 0 ? <Vacia texto="Aún no hay comisiones registradas." /> : (
          <Card><CardContent className="divide-y p-0">
            {p.comisiones.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                <Chip icono={BadgeDollarSign} color="bg-foreground text-background" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.colaborador}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.fecha} · base {fmtCOP(c.baseCalculo)}{c.descripcion ? ` · ${c.descripcion}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{fmtCOP(c.valor)}</span>
                <Pill tone="ok">{TIPO_COMISION[c.tipo] ?? c.tipo}</Pill>
                <EstadoPago pagadaEn={c.pagadaEn} />
                <BotonesFila
                  bloqueo={c.periodoCerrado ? BLOQUEO_CERRADO : null}
                  onEditar={p.puedeEditar ? () => setEditandoComision(c) : undefined}
                  onAnular={p.puedeEliminar ? () => setAnulandoComision(c) : undefined}
                />
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {grupo === 'horas' && (
        <>
          <PanelAsistencia conectada={p.asistencia.conectada} apagada={p.asistencia.apagada} esAdmin={p.esAdmin} hoy={p.hoy} />
          {/* Lo que ya está registrado como novedad (traído de AsistencIA o a mano):
              es lo que la nómina liquida, y lo que se corrige o se borra si quedó mal. */}
          {p.horas.length === 0 ? <Vacia texto="Aún no hay horas extra ni recargos registrados en la nómina." /> : (
            <Card><CardContent className="divide-y p-0">
              {p.horas.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Chip icono={ClockPlus} color="bg-foreground text-background" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.colaborador}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.fecha} · {h.horaInicio}–{h.horaFin} · {TIPO_HORA[h.tipoHora] ?? h.tipoHora}{h.deAsistencia ? ' · AsistencIA' : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{h.horas.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h</span>
                  <EstadoPago pagadaEn={h.pagadaEn} />
                  <BotonesFila
                    bloqueo={h.periodoCerrado ? BLOQUEO_CERRADO : null}
                    onEditar={p.puedeEditar ? () => setEditandoHoras(h) : undefined}
                    onAnular={p.puedeEliminar ? () => setBorrandoHoras(h) : undefined}
                    iconoAnular="trash"
                  />
                </div>
              ))}
            </CardContent></Card>
          )}
        </>
      )}

      {grupo === 'conceptos' && (
        p.conceptosNovedades.length === 0 ? <Vacia texto="Aún no hay conceptos aplicados." /> : (
          <Card><CardContent className="divide-y p-0">
            {p.conceptosNovedades.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 p-3">
                <Chip icono={Coins} color="bg-foreground text-background" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.colaborador}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.fecha} · {n.concepto} · {fmtCOP(n.valor)}</p>
                </div>
                <Pill tone={n.tipo === 'DEVENGADO' ? 'ok' : 'bad'}>{TIPO_CONCEPTO[n.tipo] ?? n.tipo}</Pill>
                <EstadoPago pagadaEn={n.pagadaEn} />
                <BotonesFila
                  bloqueo={n.periodoCerrado ? BLOQUEO_CERRADO : null}
                  onEditar={p.puedeEditar ? () => setEditandoConcepto(n) : undefined}
                  onAnular={p.puedeEliminar ? () => setBorrandoConcepto(n) : undefined}
                  iconoAnular="trash"
                />
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {(dialogo === 'comisiones' || editandoComision) && (
        <DialogComision hoy={p.hoy} colaboradores={p.colaboradores} inicial={editandoComision ?? undefined} onDone={recordarRecalculo} onClose={() => { setDialogo(null); setEditandoComision(null) }} />
      )}
      {(dialogo === 'horas' || editandoHoras) && (
        <DialogHoras hoy={p.hoy} colaboradores={p.colaboradores} inicial={editandoHoras ?? undefined} onDone={recordarRecalculo} onClose={() => { setDialogo(null); setEditandoHoras(null) }} />
      )}
      {(dialogo === 'conceptos' || editandoConcepto) && (
        <DialogConcepto hoy={p.hoy} colaboradores={p.colaboradores} conceptos={p.conceptos} inicial={editandoConcepto ?? undefined} onDone={recordarRecalculo} onClose={() => { setDialogo(null); setEditandoConcepto(null) }} />
      )}

      {anulandoComision && (
        <DialogMotivo
          titulo="Anular comisión"
          detalle={`${anulandoComision.colaborador} · ${anulandoComision.fecha} · ${TIPO_COMISION[anulandoComision.tipo] ?? anulandoComision.tipo} · ${fmtCOP(anulandoComision.valor)}${anulandoComision.pagadaEn ? ` · recogida por ${anulandoComision.pagadaEn} (se recalcula al rehacerlo)` : ''}`}
          confirmar={(motivo) => eliminarComision({ id: anulandoComision.id, motivo })}
          onClose={() => setAnulandoComision(null)}
        />
      )}
      {borrandoHoras && (
        <DialogMotivo
          titulo="Borrar novedad de horas"
          verbo="Borrar" icono="trash" exito="Novedad borrada."
          detalle={`${borrandoHoras.colaborador} · ${borrandoHoras.fecha} · ${borrandoHoras.horaInicio}–${borrandoHoras.horaFin} · ${borrandoHoras.horas} h ${TIPO_HORA[borrandoHoras.tipoHora] ?? borrandoHoras.tipoHora}${borrandoHoras.deAsistencia ? ' · vino de AsistencIA: si allá sigue, "Traer a la nómina" la vuelve a crear' : ''}`}
          confirmar={(motivo) => eliminarNovedadHoras({ id: borrandoHoras.id, motivo })}
          onClose={() => setBorrandoHoras(null)}
        />
      )}
      {borrandoConcepto && (
        <DialogMotivo
          titulo="Borrar novedad"
          verbo="Borrar" icono="trash" exito="Novedad borrada."
          detalle={`${borrandoConcepto.colaborador} · ${borrandoConcepto.fecha} · ${borrandoConcepto.concepto} · ${fmtCOP(borrandoConcepto.valor)}`}
          confirmar={(motivo) => eliminarNovedadConcepto({ id: borrandoConcepto.id, motivo })}
          onClose={() => setBorrandoConcepto(null)}
        />
      )}
    </section>
  )
}

/**
 * Lápiz y anular/borrar al final de la fila. Con bloqueo (ya lo pagó un periodo
 * cerrado) los botones se ven igual y el título dice por qué; la acción lo
 * vuelve a explicar si se intenta.
 */
function BotonesFila({ bloqueo, onEditar, onAnular, iconoAnular = 'ban' }: {
  bloqueo: string | null
  onEditar?: () => void
  onAnular?: () => void
  iconoAnular?: 'ban' | 'trash'
}) {
  if (!onEditar && !onAnular) return null
  const IconoAnular = iconoAnular === 'trash' ? Trash2 : Ban
  return (
    <div className="flex items-center gap-0.5">
      {onEditar && (
        <Button variant="ghost" size="icon" className="size-8" aria-label="Editar" title={bloqueo ?? 'Editar'} onClick={onEditar}>
          <Pencil className={cn('size-4', bloqueo && 'text-muted-foreground')} />
        </Button>
      )}
      {onAnular && (
        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={iconoAnular === 'trash' ? 'Borrar' : 'Anular'} title={bloqueo ?? (iconoAnular === 'trash' ? 'Borrar' : 'Anular')} onClick={onAnular}>
          <IconoAnular className={cn('size-4', bloqueo && 'opacity-60')} />
        </Button>
      )}
    </div>
  )
}

function Vacia({ texto }: { texto: string }) {
  return <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
}

const obligatorio = <span className="text-destructive">*</span>

function Campo({ label, obligatorio: req = false, children }: { label: string; obligatorio?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label} {req && obligatorio}</Label>{children}</div>
}

function SelectColaborador({ value, onChange, colaboradores }: {
  value: string; onChange: (v: string) => void; colaboradores: ColaboradorOpcion[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
      <SelectContent>
        {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** Registrar (sin `inicial`) o editar una comisión. */
function DialogComision({ hoy, colaboradores, inicial, onDone, onClose }: {
  hoy: string; colaboradores: ColaboradorOpcion[]; inicial?: ComisionItem; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy)
  const [tipo, setTipo] = useState<'VENTA' | 'RECAUDO'>((inicial?.tipo as 'VENTA') ?? 'VENTA')
  const [base, setBase] = useState(inicial ? String(Math.round(inicial.baseCalculo)) : '')
  const [porcentaje, setPorcentaje] = useState('')
  const [valor, setValor] = useState(inicial ? String(Math.round(inicial.valor)) : '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [g, setG] = useState(false)

  /** Con base y %, el valor se calcula solo; sigue siendo editable a mano. */
  function recalcular(nuevaBase: string, nuevoPct: string) {
    setBase(nuevaBase)
    setPorcentaje(nuevoPct)
    const b = Number(nuevaBase)
    const p = Number(nuevoPct)
    if (b > 0 && p > 0) setValor(String(Math.round(b * (p / 100))))
  }

  async function guardar() {
    if (!inicial && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    // El % no se persiste como campo; queda documentado en la descripción para trazabilidad.
    const desc = descripcion.trim() || (porcentaje ? `Comisión del ${porcentaje}% sobre la base` : '')
    const comunes = { fecha, tipo, baseCalculo: Number(base || 0), valor: Number(valor || 0), descripcion: desc || undefined }
    const res = inicial ? await editarComision({ id: inicial.id, ...comunes }) : await registrarComision({ colaboradorId, ...comunes })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(inicial ? 'Comisión actualizada.' : 'Comisión registrada.')
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{inicial ? `Editar comisión · ${inicial.colaborador}` : 'Registrar comisión'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!inicial && <Campo label="Colaborador" obligatorio><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>}
          <Campo label="Fecha de causación" obligatorio>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo label="Tipo" obligatorio>
            <Select value={tipo} onValueChange={(v) => setTipo(v as 'VENTA')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="VENTA">Venta</SelectItem>
                <SelectItem value="RECAUDO">Recaudo</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Base de cálculo (total vendido/recaudado)">
              <Input type="number" min="0" value={base} onChange={(e) => recalcular(e.target.value, porcentaje)} />
            </Campo>
            <Campo label="% de comisión">
              <Input type="number" min="0" max="100" step="0.1" value={porcentaje} onChange={(e) => recalcular(base, e.target.value)} placeholder="Ej: 5" />
            </Campo>
          </div>
          <Campo label={`Valor de la comisión${base && porcentaje ? ' (calculado — puedes ajustarlo)' : ''}`} obligatorio>
            <Input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo label="Descripción"><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !valor}>{g && <Spinner />}{inicial ? 'Guardar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Registrar (sin `inicial`) o editar una novedad de horas extra o recargo. */
function DialogHoras({ hoy, colaboradores, inicial, onDone, onClose }: {
  hoy: string; colaboradores: ColaboradorOpcion[]; inicial?: HorasItem; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  // Al editar, el rango guardado "00:00–00:00" es la marca de un registro manual sin horario.
  const inicialConRango = !!inicial && !(inicial.horaInicio === '00:00' && inicial.horaFin === '00:00')
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy)
  const [tipoHora, setTipoHora] = useState(inicial?.tipoHora ?? 'HED')
  const [modo, setModo] = useState<'RANGO' | 'MANUAL'>(inicial && !inicialConRango ? 'MANUAL' : 'RANGO')
  const [horaInicio, setHoraInicio] = useState(inicialConRango ? inicial!.horaInicio : '18:00')
  const [horaFin, setHoraFin] = useState(inicialConRango ? inicial!.horaFin : '21:00')
  const [horas, setHoras] = useState(inicial ? String(inicial.horas) : '')
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')
  const [g, setG] = useState(false)

  async function guardar() {
    if (!inicial && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!fecha) { toast.error('Indica la fecha.'); return }
    if (modo === 'MANUAL' && !horas) { toast.error('Indica la cantidad de horas.'); return }
    setG(true)
    const comunes = {
      fecha, tipoHora: tipoHora as 'HED',
      // En modo rango el backend clasifica por franja; las horas se ignoran, pero el schema pide ≥ 0.5.
      horas: modo === 'MANUAL' ? Number(horas) : 1,
      horaInicio: modo === 'RANGO' ? horaInicio : '',
      horaFin: modo === 'RANGO' ? horaFin : '',
    }
    const res = inicial
      ? await editarNovedadHoras({ id: inicial.id, ...comunes, observaciones: observaciones.trim() || undefined })
      : await registrarHoras({ colaboradorId, ...comunes })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const tramos = (res.datos as { tramos?: { tipoHora: string; horas: number }[] })?.tramos ?? []
    toast.success(
      tramos.length > 0
        ? `${inicial ? 'Actualizadas' : 'Registradas'}: ${tramos.map((t) => `${t.horas}h ${t.tipoHora}`).join(' + ')}`
        : inicial ? 'Horas actualizadas.' : 'Horas registradas.',
    )
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial ? `Editar horas · ${inicial.colaborador}` : 'Registrar horas extra o recargo'}</DialogTitle>
          <DialogDescription>Con el rango horario, el sistema clasifica solo la parte diurna y nocturna (nocturno desde las 7 p. m., Ley 2466).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!inicial && <Campo label="Colaborador" obligatorio><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha" obligatorio><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo label="Tipo de hora" obligatorio>
              <Select value={tipoHora} onValueChange={setTipoHora}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_HORA).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <Campo label="Modo de registro">
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as 'RANGO')} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem value="RANGO" id="h-rango" /><Label htmlFor="h-rango" className="font-normal">Por rango (recomendado)</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="MANUAL" id="h-manual" /><Label htmlFor="h-manual" className="font-normal">Manual</Label></div>
            </RadioGroup>
          </Campo>
          {modo === 'RANGO' ? (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Hora inicio" obligatorio><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Campo>
              <Campo label="Hora fin" obligatorio><Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></Campo>
            </div>
          ) : (
            <Campo label="Cantidad de horas" obligatorio><Input type="number" min="0.5" max="12" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} /></Campo>
          )}
          {inicial && (
            <Campo label="Observaciones"><Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></Campo>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Aplicar (sin `inicial`) o editar un concepto configurable. */
function DialogConcepto({ hoy, colaboradores, conceptos, inicial, onDone, onClose }: {
  hoy: string; colaboradores: ColaboradorOpcion[]; conceptos: ConceptoOpcion[]; inicial?: ConceptoNovedadItem; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState(inicial?.colaboradorId ?? '')
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy)
  const [conceptoId, setConceptoId] = useState(inicial?.conceptoId ?? '')
  const [valor, setValor] = useState(inicial ? String(Math.round(inicial.valor)) : '')
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')
  const [g, setG] = useState(false)

  const concepto = conceptos.find((c) => c.id === conceptoId)

  function elegirConcepto(id: string) {
    setConceptoId(id)
    // El valor fijo del concepto se precarga, pero se puede sobrescribir.
    const c = conceptos.find((x) => x.id === id)
    setValor(c?.valorFijo != null ? String(c.valorFijo) : '')
  }

  async function guardar() {
    if (!inicial && !colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!conceptoId) { toast.error('Selecciona un concepto.'); return }
    setG(true)
    const comunes = { fecha, conceptoId, valor: valor ? Number(valor) : undefined, observaciones: observaciones.trim() || undefined }
    const res = inicial ? await editarNovedadConcepto({ id: inicial.id, ...comunes }) : await registrarNovedadConcepto({ colaboradorId, ...comunes })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(inicial ? 'Novedad actualizada.' : 'Novedad aplicada.')
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial ? `Editar concepto · ${inicial.colaborador}` : 'Aplicar concepto'}</DialogTitle>
          <DialogDescription>Suma un devengado o deducción configurable a un colaborador. Lo recoge el periodo que cubra su fecha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!inicial && <Campo label="Colaborador" obligatorio><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>}
          <Campo label="Fecha de causación" obligatorio>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo label="Concepto" obligatorio>
            {/* Catálogo vacío: el select quedaría muerto sin decir por qué. El
                seed solo trae conceptos que calcula el motor, así que hasta que
                alguien cree uno propio no hay nada que aplicar aquí. */}
            {conceptos.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <p>No hay conceptos configurables todavía.</p>
                <p className="mt-1">
                  El salario, las horas extra, las comisiones y las deducciones de ley las calcula
                  el motor solo. Esto es para lo que se pacta aparte —auxilio de alimentación,
                  prima extralegal, un descuento autorizado—.
                </p>
                <Link href="/configuracion/conceptos-nomina" className="mt-2 inline-block font-medium text-primary hover:underline">
                  Crear un concepto en Ajustes →
                </Link>
              </div>
            ) : (
              <Select value={conceptoId} onValueChange={elegirConcepto}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {conceptos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre} ({TIPO_CONCEPTO[c.tipo] ?? c.tipo}{c.valorFijo != null ? ` · ${fmtCOP(c.valorFijo)}` : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Campo>
          <Campo label={`Valor ${concepto?.valorFijo != null ? '(precargado del concepto)' : ''}`} obligatorio={concepto?.valorFijo == null}>
            <Input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor en pesos" />
          </Campo>
          <Campo label="Observaciones">
            <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || conceptos.length === 0}>{g && <Spinner />}{inicial ? 'Guardar' : 'Aplicar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Si la novedad ya entró a un desprendible o sigue esperando.
 *
 * Es la señal que faltaba cuando esto vivía dentro del periodo: allá todo lo que
 * se veía era, por definición, de ese periodo. Aquí conviven las de varios meses
 * y hay que poder distinguir lo pagado de lo que aún se va a pagar.
 */
function EstadoPago({ pagadaEn }: { pagadaEn: string | null }) {
  return pagadaEn
    ? <Pill tone="muted">{pagadaEn}</Pill>
    : <Pill tone="warn">Sin pagar</Pill>
}

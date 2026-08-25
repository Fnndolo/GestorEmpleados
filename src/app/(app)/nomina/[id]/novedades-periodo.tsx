'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Coins, Clock, BadgeDollarSign, Trash2, ExternalLink } from 'lucide-react'
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
import { registrarComision, registrarHoras, registrarNovedadConcepto, eliminarNovedadConcepto } from '../acciones'

export type ColaboradorOpcion = { id: string; nombre: string }
export type ConceptoOpcion = { id: string; nombre: string; tipo: string; valorFijo: number | null }
export type ComisionItem = { id: string; colaborador: string; tipo: string; baseCalculo: number; valor: number; descripcion: string | null }
export type HoraItem = { id: string; colaborador: string; fecha: string; tipoHora: string; horas: number; horaInicio: string; horaFin: string }
export type ConceptoNovedadItem = { id: string; colaborador: string; concepto: string; tipo: string; valor: number }

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

type Props = {
  periodoId: string
  estado: string
  colaboradores: ColaboradorOpcion[]
  conceptos: ConceptoOpcion[]
  comisiones: ComisionItem[]
  horas: HoraItem[]
  conceptosNovedades: ConceptoNovedadItem[]
  /**
   * URL del panel del sistema de control de asistencia (ArriveControl), de donde
   * llegan las horas por la integración. Null si no está configurado, en cuyo
   * caso no se muestra el enlace.
   */
  urlAsistencia: string | null
}

const GRUPOS = [
  { v: 'comisiones', l: 'Comisiones' },
  { v: 'horas', l: 'Horas extra y recargos' },
  { v: 'conceptos', l: 'Otros conceptos' },
] as const
type Grupo = (typeof GRUPOS)[number]['v']

/**
 * Novedades del período de nómina: comisiones, horas extra/recargos y conceptos
 * configurables. Editable en BORRADOR/CALCULADA; solo lectura después.
 */
export function NovedadesPeriodo(p: Props) {
  const router = useRouter()
  const [grupo, setGrupo] = useState<Grupo>('comisiones')
  const [dialogo, setDialogo] = useState<Grupo | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const editable = p.estado === 'BORRADOR' || p.estado === 'CALCULADA'

  /** En CALCULADA la liquidación existente queda desactualizada al tocar novedades. */
  function recordarRecalculo() {
    if (p.estado === 'CALCULADA') toast.info('Recalcula el período para que se refleje.')
  }

  async function eliminarConcepto(id: string) {
    setEliminando(id)
    const res = await eliminarNovedadConcepto({ id })
    setEliminando(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Novedad eliminada.')
    recordarRecalculo()
    router.refresh()
  }

  return (
    <section className="mt-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold">Novedades del período</h2>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setDialogo(grupo)}>
            <Plus className="size-4" /> Agregar
          </Button>
        )}
      </div>

      <div className="mb-3 flex gap-1.5">
        {GRUPOS.map((g) => (
          <button
            key={g.v}
            type="button"
            onClick={() => setGrupo(g.v)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              grupo === g.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {g.l}
          </button>
        ))}
      </div>

      {!editable && (
        <p className="mb-2 text-xs text-muted-foreground">Período {p.estado === 'APROBADA' ? 'aprobado' : 'cerrado'}: las novedades son de solo lectura.</p>
      )}

      {grupo === 'comisiones' && (
        p.comisiones.length === 0 ? <Vacia texto="Sin comisiones en este período." /> : (
          <Card><CardContent className="divide-y p-0">
            {p.comisiones.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <Chip icono={BadgeDollarSign} color="emerald" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.colaborador}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Base {fmtCOP(c.baseCalculo)}{c.descripcion ? ` · ${c.descripcion}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{fmtCOP(c.valor)}</span>
                <Pill tone="ok">{TIPO_COMISION[c.tipo] ?? c.tipo}</Pill>
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {grupo === 'horas' && (
        <>
          {p.horas.length === 0 ? <Vacia texto="Sin horas extra ni recargos en este período." /> : (
            <Card><CardContent className="divide-y p-0">
              {p.horas.map((h) => (
                <div key={h.id} className="flex items-center gap-3 p-3">
                  <Chip icono={Clock} color="sky" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.colaborador}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.fecha}{h.horaInicio !== '00:00' ? ` · ${h.horaInicio}–${h.horaFin}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{h.horas} h</span>
                  <Pill tone="info">{TIPO_HORA[h.tipoHora] ?? h.tipoHora}</Pill>
                </div>
              ))}
            </CardContent></Card>
          )}

          {/* Trazabilidad: de dónde salen estas horas. Se abre en otra pestaña
              porque es una aplicación distinta (control de asistencia). */}
          {p.urlAsistencia && (
            <p className="mt-3 text-xs text-muted-foreground">
              Las horas marcadas llegan del sistema de control de asistencia.{' '}
              <a
                href={p.urlAsistencia}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:no-underline"
              >
                Ver marcaciones y jornadas
                <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(se abre en una pestaña nueva)</span>
              </a>
            </p>
          )}
        </>
      )}

      {grupo === 'conceptos' && (
        p.conceptosNovedades.length === 0 ? <Vacia texto="Sin conceptos aplicados en este período." /> : (
          <Card><CardContent className="divide-y p-0">
            {p.conceptosNovedades.map((n) => (
              <div key={n.id} className="flex items-center gap-3 p-3">
                <Chip icono={Coins} color={n.tipo === 'DEVENGADO' ? 'emerald' : 'rose'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.colaborador}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.concepto} · {fmtCOP(n.valor)}</p>
                </div>
                <Pill tone={n.tipo === 'DEVENGADO' ? 'ok' : 'bad'}>{TIPO_CONCEPTO[n.tipo] ?? n.tipo}</Pill>
                {editable && (
                  <Button variant="ghost" size="icon" aria-label="Eliminar novedad" onClick={() => eliminarConcepto(n.id)} disabled={eliminando !== null}>
                    {eliminando === n.id ? <Spinner /> : <Trash2 className="size-4 text-muted-foreground" />}
                  </Button>
                )}
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {dialogo === 'comisiones' && (
        <DialogComision periodoId={p.periodoId} colaboradores={p.colaboradores} onDone={recordarRecalculo} onClose={() => setDialogo(null)} />
      )}
      {dialogo === 'horas' && (
        <DialogHoras periodoId={p.periodoId} colaboradores={p.colaboradores} onDone={recordarRecalculo} onClose={() => setDialogo(null)} />
      )}
      {dialogo === 'conceptos' && (
        <DialogConcepto periodoId={p.periodoId} colaboradores={p.colaboradores} conceptos={p.conceptos} onDone={recordarRecalculo} onClose={() => setDialogo(null)} />
      )}
    </section>
  )
}

function Vacia({ texto }: { texto: string }) {
  return <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
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

function DialogComision({ periodoId, colaboradores, onDone, onClose }: {
  periodoId: string; colaboradores: ColaboradorOpcion[]; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [tipo, setTipo] = useState<'VENTA' | 'RECAUDO'>('VENTA')
  const [base, setBase] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [valor, setValor] = useState('')
  const [descripcion, setDescripcion] = useState('')
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
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    // El % no se persiste como campo; queda documentado en la descripción para trazabilidad.
    const desc = descripcion.trim() || (porcentaje ? `Comisión del ${porcentaje}% sobre la base` : '')
    const res = await registrarComision({
      colaboradorId, periodoId, tipo,
      baseCalculo: Number(base || 0), valor: Number(valor || 0),
      descripcion: desc || undefined,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Comisión registrada.')
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar comisión</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>
          <Campo label="Tipo">
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
            <Campo label="% de comisión (opcional)">
              <Input type="number" min="0" max="100" step="0.1" value={porcentaje} onChange={(e) => recalcular(base, e.target.value)} placeholder="Ej: 5" />
            </Campo>
          </div>
          <Campo label={`Valor de la comisión${base && porcentaje ? ' (calculado — puedes ajustarlo)' : ''}`}>
            <Input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo label="Descripción (opcional)"><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !valor}>{g && <Spinner />}Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogHoras({ periodoId, colaboradores, onDone, onClose }: {
  periodoId: string; colaboradores: ColaboradorOpcion[]; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [fecha, setFecha] = useState('')
  const [tipoHora, setTipoHora] = useState('HED')
  const [modo, setModo] = useState<'RANGO' | 'MANUAL'>('RANGO')
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFin, setHoraFin] = useState('21:00')
  const [horas, setHoras] = useState('')
  const [g, setG] = useState(false)

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!fecha) { toast.error('Indica la fecha.'); return }
    if (modo === 'MANUAL' && !horas) { toast.error('Indica la cantidad de horas.'); return }
    setG(true)
    const res = await registrarHoras({
      colaboradorId, periodoId, fecha, tipoHora: tipoHora as 'HED',
      // En modo rango el backend clasifica por franja; las horas se ignoran, pero el schema pide ≥ 0.5.
      horas: modo === 'MANUAL' ? Number(horas) : 1,
      horaInicio: modo === 'RANGO' ? horaInicio : '',
      horaFin: modo === 'RANGO' ? horaFin : '',
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    const tramos = (res.datos as { tramos?: { tipoHora: string; horas: number }[] })?.tramos ?? []
    toast.success(
      tramos.length > 0
        ? `Registradas: ${tramos.map((t) => `${t.horas}h ${t.tipoHora}`).join(' + ')}`
        : 'Horas registradas.',
    )
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar horas extra o recargo</DialogTitle>
          <DialogDescription>Con el rango horario, el sistema clasifica solo la parte diurna y nocturna (nocturno desde las 7 p. m., Ley 2466).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo label="Tipo de hora">
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
              <Campo label="Hora inicio"><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Campo>
              <Campo label="Hora fin"><Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></Campo>
            </div>
          ) : (
            <Campo label="Cantidad de horas"><Input type="number" min="0.5" max="12" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} /></Campo>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogConcepto({ periodoId, colaboradores, conceptos, onDone, onClose }: {
  periodoId: string; colaboradores: ColaboradorOpcion[]; conceptos: ConceptoOpcion[]; onDone: () => void; onClose: () => void
}) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [conceptoId, setConceptoId] = useState('')
  const [valor, setValor] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [g, setG] = useState(false)

  const concepto = conceptos.find((c) => c.id === conceptoId)

  function elegirConcepto(id: string) {
    setConceptoId(id)
    // El valor fijo del concepto se precarga, pero se puede sobrescribir.
    const c = conceptos.find((x) => x.id === id)
    setValor(c?.valorFijo != null ? String(c.valorFijo) : '')
  }

  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    if (!conceptoId) { toast.error('Selecciona un concepto.'); return }
    setG(true)
    const res = await registrarNovedadConcepto({
      colaboradorId, periodoId, conceptoId,
      valor: valor ? Number(valor) : undefined,
      observaciones: observaciones.trim() || undefined,
    })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Novedad aplicada.')
    onDone(); onClose(); router.refresh()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar concepto</DialogTitle>
          <DialogDescription>Suma un devengado o deducción configurable a un colaborador en este período.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectColaborador value={colaboradorId} onChange={setColaboradorId} colaboradores={colaboradores} /></Campo>
          <Campo label="Concepto">
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
          <Campo label={`Valor ${concepto?.valorFijo != null ? '(precargado del concepto)' : ''}`}>
            <Input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor en pesos" />
          </Campo>
          <Campo label="Observaciones (opcional)">
            <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || conceptos.length === 0}>{g && <Spinner />}Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

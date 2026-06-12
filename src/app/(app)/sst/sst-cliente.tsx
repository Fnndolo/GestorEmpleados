'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { cn } from '@/lib/utils'
import { formatFechaCorta } from '@/lib/fechas'
import { crearComite, crearExamenMedico, reportarAccidente, entregarEpp, crearEpp, registrarAutoevaluacion, crearPeligro } from './acciones'

const TABS = [
  { v: 'tablero', l: 'Tablero' }, { v: 'examenes', l: 'Exámenes' }, { v: 'accidentes', l: 'Accidentes' },
  { v: 'comites', l: 'Comités' }, { v: 'epp', l: 'EPP' }, { v: 'ipevr', l: 'IPEVR' }, { v: 'autoeval', l: 'Autoevaluación' },
]
const TIPO_COMITE: Record<string, string> = { VIGIA_SST: 'Vigía SST', COPASST: 'COPASST', CONVIVENCIA: 'Comité de Convivencia' }
const CONCEPTO: Record<string, string> = { APTO: 'Apto', APTO_CON_RECOMENDACIONES: 'Apto con recomendaciones', NO_APTO: 'No apto', APLAZADO: 'Aplazado' }
const NIVEL: Record<string, string> = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto', CRITICO: 'Crítico' }

type Props = {
  tab: string; puedeCrear: boolean; puedeEditar: boolean; verSalud: boolean; headcount: number
  comites: { id: string; tipo: string; vigenciaHasta: string }[]
  examenes: { id: string; colaborador: string; tipo: string; fecha: string; concepto: string; vencimiento: string | null }[]
  accidentes: { id: string; colaborador: string; fecha: string; descripcion: string; estado: string; furat: boolean }[]
  epps: { id: string; nombre: string }[]
  entregasEpp: { id: string; colaborador: string; elemento: string; cantidad: number; fecha: string }[]
  peligros: { id: string; proceso: string; peligro: string; nivel: string }[]
  autoeval: { anio: number; puntaje: number; nivelEstandar: number; planMejora: string | null } | null
}

export function SstCliente(p: Props) {
  const [dialogo, setDialogo] = useState<string | null>(null)
  const recomendacion = p.headcount < 10 ? 'Vigía SST' : 'COPASST'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <Link key={t.v} href={`/sst?tab=${t.v}`} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium', p.tab === t.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>{t.l}</Link>
          ))}
        </div>
        {p.puedeCrear && p.tab !== 'tablero' && <Button size="sm" onClick={() => setDialogo(p.tab)}><Plus className="size-4" /> Nuevo</Button>}
      </div>

      {p.tab === 'tablero' && (
        <Card><CardContent className="py-5 space-y-3">
          <p className="text-sm">Con <b>{p.headcount}</b> trabajadores activos, el organismo recomendado es: <b>{recomendacion}</b> + Comité de Convivencia Laboral.</p>
          <p className="text-xs text-muted-foreground">Las renovaciones de comités, los exámenes periódicos por vencer y el reporte FURAT generan alertas automáticas en el motor de vencimientos.</p>
          {p.autoeval && <p className="text-sm">Última autoevaluación de estándares mínimos ({p.autoeval.anio}): <b>{p.autoeval.puntaje}%</b> · nivel {p.autoeval.nivelEstandar} estándares.</p>}
        </CardContent></Card>
      )}

      {p.tab === 'examenes' && (p.examenes.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.examenes.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{e.colaborador}</p><p className="text-xs text-muted-foreground">{e.tipo} · {formatFechaCorta(new Date(e.fecha))}{e.vencimiento ? ` · vence ${formatFechaCorta(new Date(e.vencimiento))}` : ''}</p></div>
            <Badge variant={e.concepto === 'APTO' ? 'default' : 'secondary'}>{CONCEPTO[e.concepto]}</Badge>
          </div>
        ))}</CardContent></Card>
      ))}

      {p.tab === 'accidentes' && (p.accidentes.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.accidentes.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{a.colaborador}</p><p className="text-xs text-muted-foreground">{formatFechaCorta(new Date(a.fecha))} · {a.descripcion}</p></div>
            {!a.furat && <Badge variant="destructive">FURAT pendiente</Badge>}
            <Badge variant="outline">{a.estado}</Badge>
          </div>
        ))}</CardContent></Card>
      ))}

      {p.tab === 'comites' && (p.comites.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.comites.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-3"><p className="text-sm font-medium">{TIPO_COMITE[c.tipo]}</p><span className="text-xs text-muted-foreground">vigente hasta {formatFechaCorta(new Date(c.vigenciaHasta))}</span></div>
        ))}</CardContent></Card>
      ))}

      {p.tab === 'epp' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">{p.epps.map((e) => <Badge key={e.id} variant="outline">{e.nombre}</Badge>)}</div>
          {p.entregasEpp.length === 0 ? <Vacio /> : (
            <Card><CardContent className="p-0 divide-y">{p.entregasEpp.map((e) => (
              <div key={e.id} className="p-3"><p className="text-sm font-medium">{e.colaborador}</p><p className="text-xs text-muted-foreground">{e.cantidad}× {e.elemento} · {formatFechaCorta(new Date(e.fecha))}</p></div>
            ))}</CardContent></Card>
          )}
        </div>
      )}

      {p.tab === 'ipevr' && (p.peligros.length === 0 ? <Vacio /> : (
        <Card><CardContent className="p-0 divide-y">{p.peligros.map((pe) => (
          <div key={pe.id} className="flex items-center gap-3 p-3"><div className="flex-1 min-w-0"><p className="font-medium text-sm">{pe.peligro}</p><p className="text-xs text-muted-foreground">{pe.proceso}</p></div><Badge variant={pe.nivel === 'CRITICO' || pe.nivel === 'ALTO' ? 'destructive' : 'secondary'}>{NIVEL[pe.nivel]}</Badge></div>
        ))}</CardContent></Card>
      ))}

      {p.tab === 'autoeval' && (
        <Card><CardContent className="py-4">
          {p.autoeval ? (
            <div className="space-y-2">
              <p className="text-sm">Año {p.autoeval.anio}: <b>{p.autoeval.puntaje}%</b> (nivel {p.autoeval.nivelEstandar} estándares)</p>
              {p.autoeval.planMejora && <p className="text-sm text-muted-foreground">Plan de mejora: {p.autoeval.planMejora}</p>}
            </div>
          ) : <p className="text-sm text-muted-foreground">Sin autoevaluación registrada.</p>}
        </CardContent></Card>
      )}

      {dialogo === 'examenes' && <DialogExamen verSalud={p.verSalud} onClose={() => setDialogo(null)} />}
      {dialogo === 'accidentes' && <DialogAccidente onClose={() => setDialogo(null)} />}
      {dialogo === 'comites' && <DialogComite onClose={() => setDialogo(null)} />}
      {dialogo === 'epp' && <DialogEpp epps={p.epps} onClose={() => setDialogo(null)} />}
      {dialogo === 'ipevr' && <DialogPeligro onClose={() => setDialogo(null)} />}
      {dialogo === 'autoeval' && <DialogAutoeval onClose={() => setDialogo(null)} />}
    </div>
  )
}

function Vacio() { return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin registros.</CardContent></Card> }
function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }

function DialogExamen({ verSalud, onClose }: { verSalud: boolean; onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [f, setF] = useState<Record<string, string>>({ tipo: 'PERIODICO', concepto: 'APTO', fecha: new Date().toISOString().slice(0, 10) }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return } setG(true); const res = await crearExamenMedico({ colaboradorId, tipo: f.tipo as 'PERIODICO', fecha: f.fecha, fechaVencimiento: f.fechaVencimiento, concepto: f.concepto as 'APTO', recomendaciones: f.recomendaciones, restricciones: f.restricciones }); setG(false); if (res.ok) { toast.success('Examen registrado.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar examen médico</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo"><Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INGRESO">Ingreso</SelectItem><SelectItem value="PERIODICO">Periódico</SelectItem><SelectItem value="EGRESO">Egreso</SelectItem><SelectItem value="POST_INCAPACIDAD">Post incapacidad</SelectItem></SelectContent></Select></Campo>
        <Campo label="Concepto"><Select value={f.concepto} onValueChange={(v) => set('concepto', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONCEPTO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo>
        <Campo label="Próximo examen (vence)"><Input type="date" onChange={(e) => set('fechaVencimiento', e.target.value)} /></Campo>
      </div>
      {verSalud && <><Campo label="Recomendaciones (sensible)"><Textarea rows={2} onChange={(e) => set('recomendaciones', e.target.value)} /></Campo><Campo label="Restricciones (sensible)"><Textarea rows={2} onChange={(e) => set('restricciones', e.target.value)} /></Campo></>}
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogAccidente({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [f, setF] = useState<Record<string, string>>({ fecha: new Date().toISOString().slice(0, 10) }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return } setG(true); const res = await reportarAccidente({ colaboradorId, fecha: f.fecha, descripcion: f.descripcion ?? '', parteCuerpo: f.parteCuerpo, diasIncapacidad: f.diasIncapacidad ? Number(f.diasIncapacidad) : undefined }); setG(false); if (res.ok) { toast.success('Accidente reportado. Alerta FURAT generada.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Reportar accidente de trabajo</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
      <div className="grid grid-cols-2 gap-3"><Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Campo><Campo label="Parte del cuerpo"><Input onChange={(e) => set('parteCuerpo', e.target.value)} /></Campo></div>
      <Campo label="Descripción"><Textarea rows={3} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
      <Campo label="Días de incapacidad"><Input type="number" onChange={(e) => set('diasIncapacidad', e.target.value)} /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Reportar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogComite({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [tipo, setTipo] = useState('COPASST'); const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10)); const [g, setG] = useState(false)
  async function guardar() { setG(true); const res = await crearComite({ tipo: tipo as 'COPASST', fechaConformacion: fecha }); setG(false); if (res.ok) { toast.success('Comité conformado.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Conformar comité</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Tipo"><Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="VIGIA_SST">Vigía SST</SelectItem><SelectItem value="COPASST">COPASST</SelectItem><SelectItem value="CONVIVENCIA">Comité de Convivencia</SelectItem></SelectContent></Select></Campo>
      <Campo label="Fecha de conformación"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      <p className="text-xs text-muted-foreground">La renovación a 2 años se programará como alerta automática.</p>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Conformar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogEpp({ epps, onClose }: { epps: { id: string; nombre: string }[]; onClose: () => void }) {
  const router = useRouter(); const [colaboradorId, setColaboradorId] = useState(''); const [elementoEppId, setElementoEppId] = useState(''); const [nuevoEpp, setNuevoEpp] = useState(''); const [cantidad, setCantidad] = useState('1'); const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10)); const [reposicion, setReposicion] = useState(false); const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    if (nuevoEpp.trim()) { await crearEpp({ nombre: nuevoEpp.trim() }); toast.success('EPP creado. Vuelve a seleccionarlo.'); setG(false); router.refresh(); return }
    if (!colaboradorId || !elementoEppId) { toast.error('Selecciona colaborador y EPP.'); setG(false); return }
    const res = await entregarEpp({ elementoEppId, colaboradorId, cantidad: Number(cantidad), fechaEntrega: fecha, reposicion }); setG(false)
    if (res.ok) { toast.success('Entrega registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Entregar EPP</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Nuevo elemento (opcional)"><Input value={nuevoEpp} onChange={(e) => setNuevoEpp(e.target.value)} placeholder="Crear nuevo EPP…" /></Campo>
      {!nuevoEpp && <>
        <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
        <Campo label="Elemento"><Select value={elementoEppId} onValueChange={setElementoEppId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger><SelectContent>{epps.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}</SelectContent></Select></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Cantidad"><Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></Campo><Campo label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={reposicion} onCheckedChange={(v) => setReposicion(Boolean(v))} /> Es reposición</label>
      </>}
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}{nuevoEpp ? 'Crear EPP' : 'Entregar'}</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogPeligro({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [f, setF] = useState<Record<string, string>>({ nivel: 'MEDIO' }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { setG(true); const res = await crearPeligro({ proceso: f.proceso ?? '', peligro: f.peligro ?? '', riesgo: f.riesgo ?? '', nivel: f.nivel as 'MEDIO', controles: f.controles }); setG(false); if (res.ok) { toast.success('Peligro registrado.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Registrar peligro (IPEVR)</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <Campo label="Proceso"><Input onChange={(e) => set('proceso', e.target.value)} /></Campo>
      <Campo label="Peligro"><Input onChange={(e) => set('peligro', e.target.value)} /></Campo>
      <Campo label="Riesgo"><Input onChange={(e) => set('riesgo', e.target.value)} /></Campo>
      <Campo label="Nivel"><Select value={f.nivel} onValueChange={(v) => set('nivel', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(NIVEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Campo>
      <Campo label="Controles"><Textarea rows={2} onChange={(e) => set('controles', e.target.value)} /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

function DialogAutoeval({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [f, setF] = useState<Record<string, string>>({ anio: String(new Date().getUTCFullYear()), nivelEstandar: '60' }); const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() { setG(true); const res = await registrarAutoevaluacion({ anio: Number(f.anio), puntaje: Number(f.puntaje || 0), nivelEstandar: Number(f.nivelEstandar), planMejora: f.planMejora }); setG(false); if (res.ok) { toast.success('Autoevaluación registrada.'); onClose(); router.refresh() } else toast.error(res.error) }
  return (<Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Autoevaluación de estándares mínimos</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Año"><Input type="number" value={f.anio} onChange={(e) => set('anio', e.target.value)} /></Campo>
        <Campo label="Puntaje"><Input type="number" onChange={(e) => set('puntaje', e.target.value)} /></Campo>
        <Campo label="Estándares"><Select value={f.nivelEstandar} onValueChange={(v) => set('nivelEstandar', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">7</SelectItem><SelectItem value="21">21</SelectItem><SelectItem value="60">60</SelectItem></SelectContent></Select></Campo>
      </div>
      <Campo label="Plan de mejora"><Textarea rows={3} onChange={(e) => set('planMejora', e.target.value)} /></Campo>
    </div>
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter></DialogContent></Dialog>)
}

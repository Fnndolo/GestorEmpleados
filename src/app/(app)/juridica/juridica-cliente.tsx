'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, FileText, Gavel, ShieldAlert, FileLock2 } from 'lucide-react'
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
import { crearDocumentoLegal, crearProcesoDisciplinario, crearDenuncia, crearConsultaReclamo } from './acciones'

const TABS = [
  { v: 'documentos', l: 'Documentos', i: FileText },
  { v: 'disciplinarios', l: 'Disciplinarios', i: Gavel },
  { v: 'denuncias', l: 'Anti-acoso', i: ShieldAlert },
  { v: 'habeas', l: 'Habeas data', i: FileLock2 },
]
const CAT_DOC: Record<string, string> = {
  REGLAMENTO_INTERNO: 'Reglamento interno', POLITICA: 'Política', CONVENIO_FINANCIERA: 'Convenio financiera',
  POLIZA: 'Póliza', ARRIENDO: 'Arriendo', MARCA: 'Marca', DOMINIO_WEB: 'Dominio web', LICENCIA_SOFTWARE: 'Licencia',
  ACUERDO_TRANSMISION_DATOS: 'Acuerdo transmisión datos', PERMISO_ESTABLECIMIENTO: 'Permiso establecimiento', OTRO: 'Otro',
}
const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }

type Props = {
  tab: string; puedeCrear: boolean; puedeEditar: boolean
  documentos: { id: string; categoria: string; titulo: string; vigenciaFin: string | null }[]
  disciplinarios: { id: string; colaborador: string; asunto: string; etapa: string; cerrado: boolean }[]
  denuncias: { id: string; codigo: string; anonima: boolean; estado: string; fecha: string }[]
  consultas: { id: string; tipo: string; titular: string; estado: string; fechaLimite: string | null }[]
}

export function JuridicaCliente(p: Props) {
  const [dialogo, setDialogo] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <Link key={t.v} href={`/juridica?tab=${t.v}`} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium', p.tab === t.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>{t.l}</Link>
          ))}
        </div>
        {p.puedeCrear && <Button size="sm" onClick={() => setDialogo(p.tab)}><Plus className="size-4" /> Nuevo</Button>}
      </div>

      {p.tab === 'documentos' && <Lista vacio="Sin documentos legales." items={p.documentos.map((d) => ({ id: d.id, titulo: d.titulo, sub: `${CAT_DOC[d.categoria]}${d.vigenciaFin ? ` · vence ${formatFechaCorta(new Date(d.vigenciaFin))}` : ''}` }))} />}
      {p.tab === 'disciplinarios' && (
        <ListaLink vacio="Sin procesos disciplinarios." items={p.disciplinarios.map((d) => ({ id: d.id, href: `/juridica/disciplinarios/${d.id}`, titulo: d.colaborador, sub: d.asunto, badge: ETAPA[d.etapa], variante: d.cerrado ? 'secondary' : 'default' }))} />
      )}
      {p.tab === 'denuncias' && <Lista vacio="Sin denuncias." items={p.denuncias.map((d) => ({ id: d.id, titulo: `${d.codigo}${d.anonima ? ' (anónima)' : ''}`, sub: `${d.estado} · ${formatFechaCorta(new Date(d.fecha))}` }))} />}
      {p.tab === 'habeas' && <Lista vacio="Sin consultas ni reclamos." items={p.consultas.map((c) => ({ id: c.id, titulo: `${c.tipo} — ${c.titular}`, sub: `${c.estado}${c.fechaLimite ? ` · límite ${formatFechaCorta(new Date(c.fechaLimite))}` : ''}` }))} />}

      {dialogo === 'documentos' && <DialogDocumento onClose={() => setDialogo(null)} />}
      {dialogo === 'disciplinarios' && <DialogDisciplinario onClose={() => setDialogo(null)} />}
      {dialogo === 'denuncias' && <DialogDenuncia onClose={() => setDialogo(null)} />}
      {dialogo === 'habeas' && <DialogConsulta onClose={() => setDialogo(null)} />}
    </div>
  )
}

function Lista({ items, vacio }: { items: { id: string; titulo: string; sub: string }[]; vacio: string }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  return <Card><CardContent className="p-0 divide-y">{items.map((i) => <div key={i.id} className="p-3"><p className="font-medium text-sm">{i.titulo}</p><p className="text-xs text-muted-foreground">{i.sub}</p></div>)}</CardContent></Card>
}
function ListaLink({ items, vacio }: { items: { id: string; href: string; titulo: string; sub: string; badge: string; variante: 'default' | 'secondary' }[]; vacio: string }) {
  if (items.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{vacio}</CardContent></Card>
  return <Card><CardContent className="p-0 divide-y">{items.map((i) => <Link key={i.id} href={i.href} className="flex items-center gap-3 p-3 hover:bg-accent/40"><div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{i.titulo}</p><p className="text-xs text-muted-foreground truncate">{i.sub}</p></div><Badge variant={i.variante}>{i.badge}</Badge></Link>)}</CardContent></Card>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

function DialogDocumento({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({ categoria: 'POLITICA' })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearDocumentoLegal({ categoria: f.categoria as 'POLITICA', titulo: f.titulo ?? '', descripcion: f.descripcion, vigenciaFin: f.vigenciaFin })
    setG(false)
    if (res.ok) { toast.success('Documento registrado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Nuevo documento legal</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Categoría">
          <Select value={f.categoria} onValueChange={(v) => set('categoria', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CAT_DOC).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        </Campo>
        <Campo label="Título"><Input onChange={(e) => set('titulo', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Vigencia hasta (opcional — genera alerta)"><Input type="date" onChange={(e) => set('vigenciaFin', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogDisciplinario({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [f, setF] = useState<Record<string, string>>({ fechaApertura: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await crearProcesoDisciplinario({ colaboradorId, asunto: f.asunto ?? '', descripcion: f.descripcion, fechaApertura: f.fechaApertura })
    setG(false)
    if (res.ok) { toast.success('Proceso abierto.'); onClose(); router.push(`/juridica/disciplinarios/${(res.datos as { id: string }).id}`) } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Abrir proceso disciplinario</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
        <Campo label="Asunto"><Input onChange={(e) => set('asunto', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={2} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de apertura"><Input type="date" value={f.fechaApertura} onChange={(e) => set('fechaApertura', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Abrir</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogDenuncia({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [anonima, setAnonima] = useState(true)
  const [f, setF] = useState<Record<string, string>>({})
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearDenuncia({ anonima, denuncianteNombre: f.denuncianteNombre, hechos: f.hechos ?? '', fechaHechos: f.fechaHechos })
    setG(false)
    if (res.ok) { toast.success(`Denuncia registrada. Código: ${(res.datos as { codigo: string }).codigo}`); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Canal de denuncia anti-acoso</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={anonima} onCheckedChange={(v) => setAnonima(Boolean(v))} /> Denuncia anónima</label>
        {!anonima && <Campo label="Nombre del denunciante"><Input onChange={(e) => set('denuncianteNombre', e.target.value)} /></Campo>}
        <Campo label="Hechos"><Textarea rows={4} onChange={(e) => set('hechos', e.target.value)} /></Campo>
        <Campo label="Fecha de los hechos (opcional)"><Input type="date" onChange={(e) => set('fechaHechos', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

function DialogConsulta({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({ tipo: 'CONSULTA', fechaRadicacion: new Date().toISOString().slice(0, 10) })
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearConsultaReclamo({ tipo: f.tipo as 'CONSULTA', titular: f.titular ?? '', descripcion: f.descripcion ?? '', fechaRadicacion: f.fechaRadicacion })
    setG(false)
    if (res.ok) { toast.success('Registrado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Consulta o reclamo (habeas data)</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <Campo label="Tipo">
          <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="CONSULTA">Consulta (10 días hábiles)</SelectItem><SelectItem value="RECLAMO">Reclamo (15 días hábiles)</SelectItem></SelectContent></Select>
        </Campo>
        <Campo label="Titular de los datos"><Input onChange={(e) => set('titular', e.target.value)} /></Campo>
        <Campo label="Descripción"><Textarea rows={3} onChange={(e) => set('descripcion', e.target.value)} /></Campo>
        <Campo label="Fecha de radicación"><Input type="date" value={f.fechaRadicacion} onChange={(e) => set('fechaRadicacion', e.target.value)} /></Campo>
      </div>
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
    </DialogContent></Dialog>
  )
}

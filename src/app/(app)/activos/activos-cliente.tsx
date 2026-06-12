'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Laptop, Shirt, Download, UserPlus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorColaborador } from '@/components/colaboradores/selector-colaborador'
import { cn } from '@/lib/utils'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { crearActivo, asignarActivo, devolverActivo, registrarDotacion } from './acciones'

type Activo = { id: string; codigo: string; nombre: string; tipo: string; estado: string; valor: number | null; asignacion: { id: string; colaborador: string; actaEntregaDocId: string | null } | null }
type Dotacion = { id: string; colaborador: string; anio: number; corte: string; items: string; fechaEntrega: string }
type Sede = { id: string; nombre: string; ciudad: string }

const ESTADO: Record<string, string> = { DISPONIBLE: 'Disponible', ASIGNADO: 'Asignado', EN_MANTENIMIENTO: 'Mantenimiento', DADO_DE_BAJA: 'De baja' }

export function ActivosCliente({ activos, dotaciones, sedes, puedeCrear, puedeEditar }: { activos: Activo[]; dotaciones: Dotacion[]; sedes: Sede[]; puedeCrear: boolean; puedeEditar: boolean }) {
  const [tab, setTab] = useState<'activos' | 'dotacion'>('activos')
  const [dialogo, setDialogo] = useState<'activo' | 'asignar' | 'dotacion' | null>(null)
  const [asignarActivoId, setAsignarActivoId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['activos', 'dotacion'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-full px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>
              {t === 'activos' ? 'Activos' : 'Dotación'}
            </button>
          ))}
        </div>
        {puedeCrear && (
          <Button size="sm" onClick={() => setDialogo(tab === 'activos' ? 'activo' : 'dotacion')}>
            <Plus className="size-4" /> {tab === 'activos' ? 'Nuevo activo' : 'Registrar dotación'}
          </Button>
        )}
      </div>

      {tab === 'activos' ? (
        activos.length === 0 ? <Vacio icono={Laptop} /> : (
          <Card><CardContent className="p-0 divide-y">
            {activos.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <Laptop className="size-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.nombre}</p>
                  <p className="text-xs text-muted-foreground">{a.codigo} · {a.tipo}{a.asignacion && ` · ${a.asignacion.colaborador}`}</p>
                </div>
                <Badge variant={a.estado === 'ASIGNADO' ? 'default' : 'secondary'}>{ESTADO[a.estado]}</Badge>
                {a.asignacion?.actaEntregaDocId && (
                  <Button variant="ghost" size="icon" asChild aria-label="Acta"><a href={`/api/documentos/${a.asignacion.actaEntregaDocId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a></Button>
                )}
                {puedeEditar && a.estado === 'DISPONIBLE' && (
                  <Button variant="outline" size="sm" onClick={() => { setAsignarActivoId(a.id); setDialogo('asignar') }}><UserPlus className="size-4" /> Asignar</Button>
                )}
                {puedeEditar && a.asignacion && (
                  <DevolverBoton asignacionId={a.asignacion.id} />
                )}
              </div>
            ))}
          </CardContent></Card>
        )
      ) : (
        dotaciones.length === 0 ? <Vacio icono={Shirt} /> : (
          <Card><CardContent className="p-0 divide-y">
            {dotaciones.map((d) => (
              <div key={d.id} className="p-3">
                <p className="font-medium text-sm">{d.colaborador}</p>
                <p className="text-xs text-muted-foreground">{d.corte} {d.anio} · {formatFechaCorta(new Date(d.fechaEntrega))} · {d.items}</p>
              </div>
            ))}
          </CardContent></Card>
        )
      )}

      {dialogo === 'activo' && <DialogActivo sedes={sedes} onClose={() => setDialogo(null)} />}
      {dialogo === 'asignar' && asignarActivoId && <DialogAsignar activoId={asignarActivoId} onClose={() => { setDialogo(null); setAsignarActivoId(null) }} />}
      {dialogo === 'dotacion' && <DialogDotacion onClose={() => setDialogo(null)} />}
    </div>
  )
}

function Vacio({ icono: Icono }: { icono: typeof Laptop }) {
  return <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Icono className="size-8" /><p>Sin registros.</p></CardContent></Card>
}

function DevolverBoton({ asignacionId }: { asignacionId: string }) {
  const router = useRouter()
  const [c, setC] = useState(false)
  return (
    <Button variant="ghost" size="sm" disabled={c} onClick={async () => {
      setC(true); const res = await devolverActivo({ asignacionId }); setC(false)
      if (res.ok) { toast.success('Activo devuelto. Acta generada.'); router.refresh() } else toast.error(res.error)
    }}>{c ? <Spinner /> : <Undo2 className="size-4" />} Devolver</Button>
  )
}

function DialogActivo({ sedes, onClose }: { sedes: Sede[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<Record<string, string>>({})
  const [g, setG] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function guardar() {
    setG(true)
    const res = await crearActivo({ codigo: f.codigo ?? '', nombre: f.nombre ?? '', tipo: f.tipo ?? '', marca: f.marca, serie: f.serie, valor: f.valor ? Number(f.valor) : undefined, sedeId: f.sedeId })
    setG(false)
    if (res.ok) { toast.success('Activo creado.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo activo</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código"><Input onChange={(e) => set('codigo', e.target.value)} /></Campo>
          <Campo label="Tipo"><Input onChange={(e) => set('tipo', e.target.value)} placeholder="Computador…" /></Campo>
          <div className="col-span-2"><Campo label="Nombre"><Input onChange={(e) => set('nombre', e.target.value)} /></Campo></div>
          <Campo label="Marca"><Input onChange={(e) => set('marca', e.target.value)} /></Campo>
          <Campo label="Serie"><Input onChange={(e) => set('serie', e.target.value)} /></Campo>
          <Campo label="Valor"><Input type="number" onChange={(e) => set('valor', e.target.value)} /></Campo>
          <Campo label="Sede">
            <Select onValueChange={(v) => set('sedeId', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Sede…" /></SelectTrigger>
              <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
          </Campo>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Crear</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogAsignar({ activoId, onClose }: { activoId: string; onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [g, setG] = useState(false)
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await asignarActivo({ activoId, colaboradorId, fechaEntrega: fecha })
    setG(false)
    if (res.ok) { toast.success('Activo asignado. Acta de entrega generada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Asignar activo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
          <Campo label="Fecha de entrega"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Asignar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogDotacion({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [colaboradorId, setColaboradorId] = useState('')
  const [anio, setAnio] = useState(String(new Date().getUTCFullYear()))
  const [corte, setCorte] = useState('Abril')
  const [items, setItems] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [g, setG] = useState(false)
  async function guardar() {
    if (!colaboradorId) { toast.error('Selecciona un colaborador.'); return }
    setG(true)
    const res = await registrarDotacion({ colaboradorId, anio: Number(anio), corte: corte as 'Abril', items, fechaEntrega: fecha })
    setG(false)
    if (res.ok) { toast.success('Dotación registrada.'); onClose(); router.refresh() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar entrega de dotación</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Campo label="Colaborador"><SelectorColaborador value={colaboradorId} onChange={(id) => setColaboradorId(id)} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Corte (entrega)">
              <Select value={corte} onValueChange={setCorte}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Abril">Abril</SelectItem><SelectItem value="Agosto">Agosto</SelectItem><SelectItem value="Diciembre">Diciembre</SelectItem></SelectContent></Select>
            </Campo>
            <Campo label="Año"><Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} /></Campo>
          </div>
          <Campo label="Prendas entregadas"><Textarea rows={2} value={items} onChange={(e) => setItems(e.target.value)} placeholder="2 camisas, 1 pantalón, 1 par de zapatos…" /></Campo>
          <Campo label="Fecha de entrega"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={g}>{g && <Spinner />}Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

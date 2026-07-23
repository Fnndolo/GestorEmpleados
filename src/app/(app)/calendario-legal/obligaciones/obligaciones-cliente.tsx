'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { guardarObligacion, cambiarActivaObligacion } from '../acciones'

export type ObligacionItem = {
  id: string; nombre: string; categoria: string; periodicidad: string
  diaBase: number | null; mesBase: number | null; mesesBase: string | null; cadaNAnios: number | null
  porSede: boolean; responsableRol: string | null; fuenteLegal: string | null; descripcion: string | null
  activa: boolean; ocurrencias: number
}

const CATEGORIA: Record<string, string> = {
  SOCIETARIO: 'Societario', TRIBUTARIO: 'Tributario', LABORAL: 'Laboral', HABEAS_DATA: 'Habeas data',
  COMERCIAL: 'Comercial', SST: 'SST', CONTRACTUAL: 'Contractual',
}
const PERIODICIDAD: Record<string, string> = {
  MENSUAL: 'Mensual', BIMESTRAL: 'Bimestral', CUATRIMESTRAL: 'Cuatrimestral', SEMESTRAL: 'Semestral',
  ANUAL: 'Anual', CADA_N_ANIOS: 'Cada N años', POR_EVENTO: 'Por evento',
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Texto humano de la regla: "Anual · 31 de marzo", "Semestral · meses 6 y 12, día 20". */
function reglaTexto(o: ObligacionItem): string {
  const p = PERIODICIDAD[o.periodicidad] ?? o.periodicidad
  if (o.periodicidad === 'POR_EVENTO') return p
  if (o.periodicidad === 'ANUAL' || o.periodicidad === 'CADA_N_ANIOS') {
    const base = `${o.diaBase ?? 1} de ${MESES[(o.mesBase ?? 1) - 1].toLowerCase()}`
    return o.periodicidad === 'CADA_N_ANIOS' ? `Cada ${o.cadaNAnios ?? '?'} años · ${base}` : `${p} · ${base}`
  }
  if (o.periodicidad === 'SEMESTRAL') return `${p} · meses ${(o.mesesBase ?? '6,12').replaceAll(',', ' y ')}, día ${o.diaBase ?? 1}`
  return `${p} · día ${o.diaBase ?? 1}`
}

export function ObligacionesCliente({ obligaciones, roles, puedeGestionar }: { obligaciones: ObligacionItem[]; roles: string[]; puedeGestionar: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<ObligacionItem | 'nueva' | null>(null)
  const [cambiando, setCambiando] = useState<string | null>(null)

  async function toggleActiva(o: ObligacionItem) {
    setCambiando(o.id)
    const res = await cambiarActivaObligacion({ id: o.id, activa: !o.activa })
    setCambiando(null)
    if (res.ok) { toast.success(o.activa ? 'Obligación desactivada; sus fechas futuras se eliminaron.' : 'Obligación activada. Genera las próximas fechas en el calendario.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {puedeGestionar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditando('nueva')}><Plus className="size-4" /> Nueva obligación</Button>
        </div>
      )}

      <Card><CardContent className="divide-y p-0">
        {obligaciones.map((o) => (
          <div key={o.id} className={`flex items-center gap-3 p-3 ${o.activa ? '' : 'opacity-55'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{o.nombre}</p>
                {o.porSede && <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="Por sede" />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {CATEGORIA[o.categoria] ?? o.categoria} · {reglaTexto(o)}
                {o.responsableRol ? ` · ${o.responsableRol}` : ''}
                {o.fuenteLegal ? ` · ${o.fuenteLegal}` : ''}
              </p>
            </div>
            <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{o.ocurrencias} fechas</Badge>
            {puedeGestionar && (
              <>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(o)} aria-label="Editar"><Pencil className="size-4" /></Button>
                <Switch checked={o.activa} disabled={cambiando === o.id} onCheckedChange={() => toggleActiva(o)} aria-label="Activa" />
              </>
            )}
          </div>
        ))}
        {obligaciones.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No hay obligaciones en el catálogo.</p>}
      </CardContent></Card>

      {editando && (
        <DialogObligacion
          inicial={editando === 'nueva' ? null : editando}
          roles={roles}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

function DialogObligacion({ inicial, roles, onClose }: { inicial: ObligacionItem | null; roles: string[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? '',
    categoria: inicial?.categoria ?? 'TRIBUTARIO',
    periodicidad: inicial?.periodicidad ?? 'ANUAL',
    diaBase: inicial?.diaBase != null ? String(inicial.diaBase) : '',
    mesBase: inicial?.mesBase != null ? String(inicial.mesBase) : '',
    mesesBase: inicial?.mesesBase ?? '',
    cadaNAnios: inicial?.cadaNAnios != null ? String(inicial.cadaNAnios) : '',
    responsableRol: inicial?.responsableRol ?? '',
    fuenteLegal: inicial?.fuenteLegal ?? '',
    descripcion: inicial?.descripcion ?? '',
  })
  const [porSede, setPorSede] = useState(inicial?.porSede ?? false)
  const [g, setG] = useState(false)
  const set = (k: string, val: string) => setF((p) => ({ ...p, [k]: val }))

  const p = f.periodicidad
  const usaDia = p !== 'POR_EVENTO'
  const usaMes = p === 'ANUAL' || p === 'CADA_N_ANIOS'
  const usaMeses = p === 'SEMESTRAL'
  const usaN = p === 'CADA_N_ANIOS'

  async function guardar() {
    if (f.nombre.trim().length < 3) { toast.error('Escribe el nombre de la obligación.'); return }
    setG(true)
    const res = await guardarObligacion({
      id: inicial?.id,
      nombre: f.nombre,
      categoria: f.categoria as 'TRIBUTARIO',
      periodicidad: f.periodicidad as 'ANUAL',
      diaBase: usaDia && f.diaBase ? Number(f.diaBase) : undefined,
      mesBase: usaMes && f.mesBase ? Number(f.mesBase) : undefined,
      mesesBase: usaMeses ? f.mesesBase : '',
      cadaNAnios: usaN && f.cadaNAnios ? Number(f.cadaNAnios) : undefined,
      porSede,
      responsableRol: f.responsableRol,
      fuenteLegal: f.fuenteLegal,
      descripcion: f.descripcion,
    })
    setG(false)
    if (res.ok) {
      toast.success(inicial
        ? 'Obligación actualizada. Sus fechas futuras se recalcularán al generar el calendario.'
        : 'Obligación creada. Genera las próximas fechas en el calendario.')
      onClose(); router.refresh()
    } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar obligación' : 'Nueva obligación'}</DialogTitle>
          <DialogDescription>Define la regla de recurrencia; el calendario genera las fechas concretas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Nombre"><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej.: Declaración de IVA" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Categoría">
              <Select value={f.categoria} onValueChange={(val) => set('categoria', val)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIA).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Periodicidad">
              <Select value={f.periodicidad} onValueChange={(val) => set('periodicidad', val)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PERIODICIDAD).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {usaDia && <Campo label="Día del mes (límite)"><Input type="number" min={1} max={31} value={f.diaBase} onChange={(e) => set('diaBase', e.target.value)} placeholder="Ej.: 18" /></Campo>}
            {usaMes && (
              <Campo label="Mes">
                <Select value={f.mesBase} onValueChange={(val) => set('mesBase', val)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </Campo>
            )}
            {usaMeses && <Campo label="Meses (separados por coma)"><Input value={f.mesesBase} onChange={(e) => set('mesesBase', e.target.value)} placeholder="Ej.: 6,12" /></Campo>}
            {usaN && <Campo label="Cada cuántos años"><Input type="number" min={1} max={50} value={f.cadaNAnios} onChange={(e) => set('cadaNAnios', e.target.value)} placeholder="Ej.: 2" /></Campo>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Responsable (rol)">
              <Select value={f.responsableRol || undefined} onValueChange={(val) => set('responsableRol', val)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Sin responsable" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Fuente legal (opcional)"><Input value={f.fuenteLegal} onChange={(e) => set('fuenteLegal', e.target.value)} placeholder="Ej.: E.T. art. 600" /></Campo>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={porSede} onCheckedChange={(val) => setPorSede(Boolean(val))} />
            Se cumple por cada sede (genera una fecha por sede: ICA, matrícula, simulacros…)
          </label>

          <Campo label="Descripción (opcional)"><Textarea rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Campo>

          {inicial && (
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              Al guardar, las fechas futuras pendientes de esta obligación se eliminan y se recrean con la regla nueva
              cuando uses «Generar próximas fechas». El historial cumplido no se toca.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />}{inicial ? 'Guardar cambios' : 'Crear obligación'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

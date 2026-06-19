'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearCargo, editarCargo, alternarCargo } from './acciones'

type Cargo = { id: string; nombre: string; areaId: string; area: string; nivel: string; funciones: string; claseRiesgoDefecto: string; activo: boolean; asignados: number }
type Area = { id: string; nombre: string }

const NIVELES = [{ v: 'directivo', l: 'Directivo' }, { v: 'coordinacion', l: 'Coordinación' }, { v: 'operativo', l: 'Operativo' }]
const RIESGOS = ['I', 'II', 'III', 'IV', 'V']
const NONE = '__none__'

export function CargosCliente({ puedeCrear, puedeEditar, areas, cargos }: { puedeCrear: boolean; puedeEditar: boolean; areas: Area[]; cargos: Cargo[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Cargo | null>(null)
  const [g, setG] = useState(false)
  const [f, setF] = useState({ nombre: '', areaId: '', nivel: '', funciones: '', claseRiesgoDefecto: '', activo: true })

  function abrirNuevo() {
    setEditando(null)
    setF({ nombre: '', areaId: areas[0]?.id ?? '', nivel: '', funciones: '', claseRiesgoDefecto: '', activo: true })
    setAbierto(true)
  }
  function abrirEditar(c: Cargo) {
    setEditando(c)
    setF({ nombre: c.nombre, areaId: c.areaId, nivel: c.nivel, funciones: c.funciones, claseRiesgoDefecto: c.claseRiesgoDefecto, activo: c.activo })
    setAbierto(true)
  }

  async function guardar() {
    if (!f.nombre.trim() || !f.areaId) { toast.error('Indica el nombre y el área.'); return }
    setG(true)
    const payload = { ...f, nivel: (f.nivel as 'directivo') || undefined, claseRiesgoDefecto: (f.claseRiesgoDefecto as 'I') || undefined, funciones: f.funciones || undefined }
    const res = editando ? await editarCargo({ id: editando.id, ...payload }) : await crearCargo(payload)
    setG(false)
    if (res.ok) { toast.success(editando ? 'Cargo actualizado.' : 'Cargo creado.'); setAbierto(false); router.refresh() }
    else toast.error(res.error)
  }

  async function alternar(c: Cargo) {
    const res = await alternarCargo({ id: c.id, activo: !c.activo })
    if (res.ok) router.refresh(); else toast.error(res.error)
  }

  return (
    <>
      {puedeCrear && (
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={abrirNuevo}><Plus className="size-4" /> Nuevo cargo</Button>
        </div>
      )}
      <Card><CardContent className="p-0 divide-y">
        {cargos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay cargos.</p>
        ) : cargos.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{c.nombre}</p>
                {!c.activo && <Badge variant="secondary">Inactivo</Badge>}
                {c.nivel && <Badge variant="outline" className="capitalize">{c.nivel}</Badge>}
                {c.claseRiesgoDefecto && <Badge variant="outline">Riesgo {c.claseRiesgoDefecto}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{c.area}{c.asignados > 0 ? ` · ${c.asignados} asignado(s)` : ''}</p>
            </div>
            {puedeEditar && (
              <>
                <Switch checked={c.activo} onCheckedChange={() => alternar(c)} />
                <Button size="sm" variant="outline" onClick={() => abrirEditar(c)}><Pencil className="size-4" /> Editar</Button>
              </>
            )}
          </div>
        ))}
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editando ? 'Editar cargo' : 'Nuevo cargo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select value={f.areaId} onValueChange={(v) => setF({ ...f, areaId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nivel</Label>
                <Select value={f.nivel || NONE} onValueChange={(v) => setF({ ...f, nivel: v === NONE ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin definir —</SelectItem>
                    {NIVELES.map((n) => <SelectItem key={n.v} value={n.v}>{n.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Clase de riesgo ARL</Label>
                <Select value={f.claseRiesgoDefecto || NONE} onValueChange={(v) => setF({ ...f, claseRiesgoDefecto: v === NONE ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin definir —</SelectItem>
                    {RIESGOS.map((r) => <SelectItem key={r} value={r}>Clase {r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Funciones (opcional)</Label><Textarea rows={3} value={f.funciones} onChange={(e) => setF({ ...f, funciones: e.target.value })} placeholder="Usadas en la certificación laboral con funciones" /></div>
            <div className="flex items-center gap-2"><Switch checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} /><Label className="font-normal">Activo</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={g}>{g && <Spinner />} Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

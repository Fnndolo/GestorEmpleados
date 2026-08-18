'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearArea, editarArea, alternarArea, eliminarArea } from './acciones'
import { Ayuda } from '@/components/ui-kit/ayuda'

type Area = {
  id: string; nombre: string; padreId: string; padreNombre: string
  responsableId: string; responsableNombre: string; activa: boolean
  cargos: number; colaboradores: number; hijas: number
}
type Colaborador = { id: string; nombre: string }

const NINGUNO = '__ninguno__'
type Formulario = { nombre: string; padreId: string; responsableId: string; activa: boolean }
const VACIO: Formulario = { nombre: '', padreId: '', responsableId: '', activa: true }

export function AreasCliente({
  puedeCrear, puedeEditar, puedeEliminar, areas, colaboradores,
}: {
  puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean
  areas: Area[]; colaboradores: Colaborador[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Area | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState<Formulario>(VACIO)

  function abrirNuevo() {
    setEditando(null)
    setF(VACIO)
    setAbierto(true)
  }
  function abrirEditar(a: Area) {
    setEditando(a)
    setF({ nombre: a.nombre, padreId: a.padreId, responsableId: a.responsableId, activa: a.activa })
    setAbierto(true)
  }

  async function guardar() {
    if (!f.nombre.trim()) { toast.error('Indica el nombre del área.'); return }
    setGuardando(true)
    const res = editando
      ? await editarArea({ id: editando.id, ...f })
      : await crearArea(f)
    setGuardando(false)
    if (res.ok) {
      toast.success(editando ? 'Área actualizada.' : 'Área creada.')
      setAbierto(false)
      router.refresh()
    } else toast.error(res.error)
  }

  async function alternar(a: Area) {
    const res = await alternarArea({ id: a.id, activa: !a.activa })
    if (res.ok) router.refresh(); else toast.error(res.error)
  }

  async function eliminar(a: Area) {
    if (!confirm(`¿Eliminar el área "${a.nombre}"? Esta acción no se puede deshacer.`)) return
    const res = await eliminarArea({ id: a.id })
    if (res.ok) { toast.success('Área eliminada.'); router.refresh() }
    else toast.error(res.error)
  }

  // El padre no puede ser el área que se edita (el resto de ciclos los valida el servidor).
  const posiblesPadres = areas.filter((a) => a.id !== editando?.id)

  return (
    <>
      {puedeCrear && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={abrirNuevo}><Plus className="size-4" /> Nueva área</Button>
        </div>
      )}

      <Card><CardContent className="p-0 divide-y">
        {areas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aún no hay áreas. Crea la primera para poder registrar cargos y colaboradores.
          </p>
        ) : areas.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{a.nombre}</p>
                {!a.activa && <Badge variant="secondary">Inactiva</Badge>}
                {a.padreNombre && <Badge variant="outline">Depende de {a.padreNombre}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {a.responsableNombre ? `Responsable: ${a.responsableNombre}` : 'Sin responsable'}
                {a.cargos > 0 && ` · ${a.cargos} cargo(s)`}
                {a.colaboradores > 0 && ` · ${a.colaboradores} colaborador(es)`}
                {a.hijas > 0 && ` · ${a.hijas} subárea(s)`}
              </p>
            </div>
            {puedeEditar && (
              <>
                <Switch checked={a.activa} onCheckedChange={() => alternar(a)} />
                <Button size="sm" variant="outline" onClick={() => abrirEditar(a)}>
                  <Pencil className="size-4" /> Editar
                </Button>
              </>
            )}
            {puedeEliminar && a.cargos === 0 && a.colaboradores === 0 && a.hijas === 0 && (
              <Button size="icon" variant="ghost" onClick={() => eliminar(a)} aria-label="Eliminar">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editando ? 'Editar área' : 'Nueva área'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Depende de
                <Ayuda texto="Deja vacío si el área no cuelga de ninguna otra. Sirve para armar el organigrama por niveles." etiqueta="Sobre el área padre" />
              </Label>
              <Select
                value={f.padreId || NINGUNO}
                onValueChange={(v) => setF({ ...f, padreId: v === NINGUNO ? '' : v })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>— Área de primer nivel —</SelectItem>
                  {posiblesPadres.map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Responsable
                <Ayuda texto="Una misma persona puede responder por varias áreas. Es informativo: los permisos los da el rol del usuario, no este campo." etiqueta="Sobre el responsable" />
              </Label>
              <Select
                value={f.responsableId || NINGUNO}
                onValueChange={(v) => setF({ ...f, responsableId: v === NINGUNO ? '' : v })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>— Sin responsable —</SelectItem>
                  {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={f.activa} onCheckedChange={(v) => setF({ ...f, activa: v })} />
              <Label className="font-normal">Activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Spinner />} Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

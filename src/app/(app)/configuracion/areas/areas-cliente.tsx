'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
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
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { cn } from '@/lib/utils'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Encabezado } from '@/components/shell/encabezado'

type Area = {
  id: string; nombre: string; padreId: string; padreNombre: string
  responsableId: string; responsableNombre: string; activa: boolean
  cargos: number; colaboradores: number; hijas: number
}
type Colaborador = { id: string; nombre: string }

/**
 * Por qué NO se puede borrar un área, o null si sí se puede. Enumera todos los
 * estorbos a la vez, para no obligar a resolverlos de a uno y volver a probar.
 */
function motivoNoEliminar(a: Area): string | null {
  const usos: string[] = []
  if (a.colaboradores > 0) usos.push(`${a.colaboradores} colaborador(es)`)
  if (a.cargos > 0) usos.push(`${a.cargos} cargo(s)`)
  if (a.hijas > 0) usos.push(`${a.hijas} subárea(s)`)
  if (usos.length === 0) return null
  return `No se puede eliminar: el área tiene ${usos.join(' y ')}. Reasígnalos primero, o desactívala si ya no se usa.`
}

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
      <Encabezado
        enLinea
        titulo="Áreas"
        ayuda="La estructura de la empresa. Un área puede depender de otra (organigrama) y tener un responsable. Los cargos se crean dentro de un área, así que estas van primero."
        acciones={puedeCrear && <BotonAgregar etiqueta="Nueva área" onClick={abrirNuevo} />}
      />

      <Card className="py-0"><CardContent className="divide-y p-0">
        {areas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay áreas.</p>
        ) : areas.map((a) => {
          // Un solo renglón de detalle; completo al pasar el mouse.
          const detalle = [
            a.padreNombre && `Depende de ${a.padreNombre}`,
            a.responsableNombre ? `Responsable: ${a.responsableNombre}` : 'Sin responsable',
            a.cargos > 0 && `${a.cargos} cargo(s)`,
            a.colaboradores > 0 && `${a.colaboradores} colaborador(es)`,
            a.hijas > 0 && `${a.hijas} subárea(s)`,
          ].filter(Boolean).join(' · ')
          return (
            <div key={a.id} className={cn('flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4', !a.activa && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{a.nombre}</span>
                  {!a.activa && <Badge variant="secondary">Inactiva</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={detalle}>{detalle}</p>
              </div>
              {puedeEditar && (
                <>
                  <Switch checked={a.activa} onCheckedChange={() => alternar(a)} aria-label={a.activa ? `Desactivar ${a.nombre}` : `Activar ${a.nombre}`} title={a.activa ? 'Activa' : 'Inactiva'} />
                  <Button size="icon" variant="ghost" onClick={() => abrirEditar(a)} aria-label={`Editar ${a.nombre}`} title="Editar">
                    <Pencil className="size-4" />
                  </Button>
                </>
              )}
              {puedeEliminar && (
                // Ancho fijo: la papelera bloqueada mide distinto y descuadraba la columna.
                <span className="grid w-9 shrink-0 place-items-center">
                  <BotonEliminar onEliminar={() => eliminar(a)} motivoBloqueo={motivoNoEliminar(a)} />
                </span>
              )}
            </div>
          )
        })}
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editando ? 'Editar área' : 'Nueva área'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
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

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, ShieldCheck, ChevronRight, Pencil, Save } from 'lucide-react'
import { ACCIONES, type Accion, type Alcance } from '@/lib/permisos/modulos'
import { crearRol, editarRol, eliminarRol, guardarMatriz } from './acciones'
import { Button } from '@/components/ui/button'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Permiso = { modulo: string; accion: string; alcance: string }
type Rol = {
  id: string; nombre: string; descripcion: string | null
  esSistema: boolean; usuarios: number; permisos: Permiso[]
}
type Modulo = { clave: string; etiqueta: string }

const ALCANCES: { valor: Alcance; etiqueta: string }[] = [
  { valor: 'TODAS_SEDES', etiqueta: 'Todas las sedes' },
  { valor: 'SEDES_ASIGNADAS', etiqueta: 'Sedes asignadas' },
  { valor: 'EQUIPO', etiqueta: 'Su equipo' },
  { valor: 'PROPIO', etiqueta: 'Solo lo propio' },
]
const ACCION_ETIQUETA: Record<Accion, string> = {
  VER: 'Ver', CREAR: 'Crear', EDITAR: 'Editar', ELIMINAR: 'Eliminar', APROBAR: 'Aprobar', EXPORTAR: 'Exportar',
}

export function RolesCliente({
  roles, modulos, puedeEditar,
}: {
  roles: Rol[]; modulos: Modulo[]; puedeEditar: boolean
}) {
  const [editandoMatriz, setEditandoMatriz] = useState<Rol | null>(null)
  const [editandoRol, setEditandoRol] = useState<Rol | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [eliminar, setEliminar] = useState<Rol | null>(null)

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button onClick={() => setNuevo(true)}><Plus className="size-4" /> Nuevo rol</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.id} className="group">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{r.nombre}</p>
                    {r.esSistema && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{r.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.usuarios} usuario(s) · {r.permisos.length} permisos
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditandoMatriz(r)}>
                  Permisos <ChevronRight className="size-4" />
                </Button>
                {puedeEditar && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setEditandoRol(r)} aria-label="Editar">
                      <Pencil className="size-4" />
                    </Button>
                    <BotonEliminar
                      onEliminar={() => setEliminar(r)}
                      motivoBloqueo={r.esSistema ? 'No se puede eliminar: es un rol del sistema. Puedes ajustar sus permisos, pero no borrarlo.' : null}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editandoMatriz && (
        <DialogMatriz rol={editandoMatriz} modulos={modulos} puedeEditar={puedeEditar} onClose={() => setEditandoMatriz(null)} />
      )}
      {(nuevo || editandoRol) && (
        <DialogRol rol={editandoRol} onClose={() => { setNuevo(false); setEditandoRol(null) }} />
      )}
      {eliminar && (
        <AlertDialog open onOpenChange={(o) => !o && setEliminar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar rol «{eliminar.nombre}»</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const res = await eliminarRol({ id: eliminar.id })
                  if (res.ok) toast.success('Rol eliminado.')
                  else toast.error(res.error)
                  setEliminar(null)
                }}
              >Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function DialogMatriz({
  rol, modulos, puedeEditar, onClose,
}: { rol: Rol; modulos: Modulo[]; puedeEditar: boolean; onClose: () => void }) {
  // Estado: por módulo, set de acciones marcadas + alcance
  const inicial: Record<string, { acciones: Set<Accion>; alcance: Alcance }> = {}
  for (const m of modulos) {
    const permisos = rol.permisos.filter((p) => p.modulo === m.clave)
    inicial[m.clave] = {
      acciones: new Set(permisos.map((p) => p.accion as Accion)),
      alcance: (permisos[0]?.alcance as Alcance) ?? 'TODAS_SEDES',
    }
  }
  const [estado, setEstado] = useState(inicial)
  const [guardando, setGuardando] = useState(false)

  function alternarAccion(modulo: string, accion: Accion, checked: boolean) {
    setEstado((prev) => {
      const acciones = new Set(prev[modulo].acciones)
      if (checked) acciones.add(accion)
      else acciones.delete(accion)
      return { ...prev, [modulo]: { ...prev[modulo], acciones } }
    })
  }
  function cambiarAlcance(modulo: string, alcance: Alcance) {
    setEstado((prev) => ({ ...prev, [modulo]: { ...prev[modulo], alcance } }))
  }

  async function guardar() {
    setGuardando(true)
    const permisos = modulos.flatMap((m) =>
      [...estado[m.clave].acciones].map((accion) => ({
        modulo: m.clave,
        accion,
        alcance: estado[m.clave].alcance,
      })),
    )
    const res = await guardarMatriz({ rolId: rol.id, permisos })
    setGuardando(false)
    if (res.ok) { toast.success('Permisos guardados.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Ancho fijado a mano y no con max-w-*: la tabla son ocho columnas y con
          768px la de Módulo y la de Ver quedaban fuera, obligando a desplazarse
          de lado para marcar casillas sin ver de qué módulo eran. */}
      <DialogContent className="flex max-h-[88vh] w-[min(96vw,1080px)] flex-col overflow-hidden sm:max-w-[1080px]">
        <DialogHeader>
          <DialogTitle>Permisos · {rol.nombre}</DialogTitle>
          <DialogDescription>
            Marca las acciones por módulo y define el alcance de datos. {!puedeEditar && '(Solo lectura)'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {/* Escritorio: la tabla es lo más legible, ocho columnas caben de sobra. */}
          <table className="hidden w-full text-sm lg:table">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="w-[38%] py-2 font-medium">Módulo</th>
                {ACCIONES.map((a) => (
                  <th key={a} className="w-[7.5%] px-1 py-2 text-center text-xs font-medium">{ACCION_ETIQUETA[a]}</th>
                ))}
                <th className="py-2 pl-2 font-medium">Alcance</th>
              </tr>
            </thead>
            <tbody>
              {modulos.map((m) => (
                <tr key={m.clave} className="border-b last:border-0">
                  <td className="py-2 pr-2">{m.etiqueta}</td>
                  {ACCIONES.map((a) => (
                    <td key={a} className="py-2 px-1 text-center">
                      <Checkbox
                        disabled={!puedeEditar}
                        checked={estado[m.clave].acciones.has(a)}
                        onCheckedChange={(v) => alternarAccion(m.clave, a, Boolean(v))}
                      />
                    </td>
                  ))}
                  <td className="w-[17%] py-2 pl-2">
                    <Select
                      disabled={!puedeEditar || estado[m.clave].acciones.size === 0}
                      value={estado[m.clave].alcance}
                      onValueChange={(v) => cambiarAlcance(m.clave, v as Alcance)}
                    >
                      <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALCANCES.map((al) => <SelectItem key={al.valor} value={al.valor}>{al.etiqueta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Móvil: la misma tabla obligaba a desplazarse a los lados, y la
              columna de Exportar quedaba fuera de la pantalla — se marcaban
              permisos sin ver cuáles. Una tarjeta por módulo cabe entera. */}
          <div className="space-y-3 lg:hidden">
            {modulos.map((m) => {
              const marcadas = estado[m.clave].acciones
              return (
                <div key={m.clave} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{m.etiqueta}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {marcadas.size === 0 ? 'Sin acceso' : `${marcadas.size} de ${ACCIONES.length}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {ACCIONES.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          disabled={!puedeEditar}
                          checked={marcadas.has(a)}
                          onCheckedChange={(v) => alternarAccion(m.clave, a, Boolean(v))}
                        />
                        {ACCION_ETIQUETA[a]}
                      </label>
                    ))}
                  </div>
                  {marcadas.size > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs text-muted-foreground">Alcance de datos</p>
                      <Select
                        disabled={!puedeEditar}
                        value={estado[m.clave].alcance}
                        onValueChange={(v) => cambiarAlcance(m.clave, v as Alcance)}
                      >
                        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALCANCES.map((al) => <SelectItem key={al.valor} value={al.valor}>{al.etiqueta}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {puedeEditar && (
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? <Spinner /> : <Save className="size-4" />} Guardar permisos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogRol({ rol, onClose }: { rol: Rol | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const res = rol
      ? await editarRol({ id: rol.id, nombre, descripcion })
      : await crearRol({ nombre, descripcion })
    setGuardando(false)
    if (res.ok) { toast.success(rol ? 'Rol actualizado.' : 'Rol creado.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rol ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
          <DialogDescription>Luego define sus permisos desde el botón «Permisos».</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || nombre.length < 2}>{guardando && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

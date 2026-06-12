'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Pencil, Mail, KeyRound } from 'lucide-react'
import {
  crearUsuarioSchema, editarUsuarioSchema,
  type CrearUsuarioInput, type EditarUsuarioInput,
} from '@/lib/validaciones/usuarios'
import { crearUsuario, editarUsuario, reenviarAcceso } from './acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Usuario = {
  id: string; nombre: string; email: string; rolId: string; rolNombre: string
  estado: string; telefonoE164: string | null; debeCambiarPassword: boolean
  ultimoAcceso: string | null; sedeIds: string[]; sedeNombres: string[]
}
type Rol = { id: string; nombre: string }
type Sede = { id: string; nombre: string; ciudad: string }

const ESTADO_VARIANTE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  ACTIVO: 'default', INACTIVO: 'secondary', BLOQUEADO: 'destructive',
}

export function UsuariosCliente({
  usuarios, roles, sedes, puedeCrear, puedeEditar,
}: {
  usuarios: Usuario[]; roles: Rol[]; sedes: Sede[]; puedeCrear: boolean; puedeEditar: boolean
}) {
  const [nuevo, setNuevo] = useState(false)
  const [editar, setEditar] = useState<Usuario | null>(null)

  return (
    <div className="space-y-4">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setNuevo(true)}><Plus className="size-4" /> Nuevo usuario</Button>
        </div>
      )}
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="hidden md:table-cell">Sedes</TableHead>
              <TableHead>Estado</TableHead>
              {puedeEditar && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.nombre}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell><Badge variant="outline">{u.rolNombre}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {u.sedeNombres.length ? u.sedeNombres.join(', ') : 'Todas'}
                </TableCell>
                <TableCell>
                  <Badge variant={ESTADO_VARIANTE[u.estado]}>{u.estado}</Badge>
                  {u.debeCambiarPassword && (
                    <p className="text-[10px] text-amber-600 mt-0.5">Pendiente 1er ingreso</p>
                  )}
                </TableCell>
                {puedeEditar && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditar(u)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <ReenviarBoton id={u.id} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {nuevo && <DialogNuevo roles={roles} sedes={sedes} onClose={() => setNuevo(false)} />}
      {editar && <DialogEditar usuario={editar} roles={roles} sedes={sedes} onClose={() => setEditar(null)} />}
    </div>
  )
}

function ReenviarBoton({ id }: { id: string }) {
  const [cargando, setCargando] = useState(false)
  async function reenviar() {
    setCargando(true)
    const res = await reenviarAcceso({ id })
    setCargando(false)
    if (res.ok) toast.success('Acceso reenviado por correo.')
    else toast.error(res.error)
  }
  return (
    <Button variant="ghost" size="icon" onClick={reenviar} disabled={cargando} aria-label="Reenviar acceso" title="Reenviar acceso">
      {cargando ? <Spinner /> : <KeyRound className="size-4" />}
    </Button>
  )
}

function SelectorSedes({
  sedes, seleccionadas, onChange,
}: { sedes: Sede[]; seleccionadas: string[]; onChange: (ids: string[]) => void }) {
  function alternar(id: string, checked: boolean) {
    onChange(checked ? [...seleccionadas, id] : seleccionadas.filter((x) => x !== id))
  }
  return (
    <div className="space-y-1.5">
      <Label>Sedes asignadas <span className="text-muted-foreground font-normal">(vacío = todas)</span></Label>
      <div className="rounded-lg border p-3 space-y-2 max-h-40 overflow-y-auto">
        {sedes.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={seleccionadas.includes(s.id)}
              onCheckedChange={(v) => alternar(s.id, Boolean(v))}
            />
            {s.nombre} · {s.ciudad}
          </label>
        ))}
      </div>
    </div>
  )
}

function DialogNuevo({ roles, sedes, onClose }: { roles: Rol[]; sedes: Sede[]; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CrearUsuarioInput>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { nombre: '', email: '', rolId: '', telefonoE164: '', sedeIds: [] },
  })
  const sedeIds = watch('sedeIds')

  async function onSubmit(datos: CrearUsuarioInput) {
    setGuardando(true)
    const res = await crearUsuario(datos)
    setGuardando(false)
    if (res.ok) { toast.success('Usuario creado. Se envió la invitación por correo.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Recibirá un correo con una contraseña temporal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre completo</Label>
            <Input {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Correo electrónico</Label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select onValueChange={(v) => setValue('rolId', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent>
              </Select>
              {errors.rolId && <p className="text-xs text-destructive">{errors.rolId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono (opcional)</Label>
              <Input {...register('telefonoE164')} placeholder="+57…" />
            </div>
          </div>
          <SelectorSedes sedes={sedes} seleccionadas={sedeIds} onChange={(ids) => setValue('sedeIds', ids)} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? <Spinner /> : <Mail className="size-4" />} Crear y enviar invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogEditar({ usuario, roles, sedes, onClose }: { usuario: Usuario; roles: Rol[]; sedes: Sede[]; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: {
      id: usuario.id, nombre: usuario.nombre, rolId: usuario.rolId,
      estado: usuario.estado as EditarUsuarioInput['estado'],
      telefonoE164: usuario.telefonoE164 ?? '', sedeIds: usuario.sedeIds,
    },
  })
  const sedeIds = watch('sedeIds')

  async function onSubmit(datos: EditarUsuarioInput) {
    setGuardando(true)
    const res = await editarUsuario(datos)
    setGuardando(false)
    if (res.ok) { toast.success('Usuario actualizado.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre completo</Label>
            <Input {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select defaultValue={usuario.rolId} onValueChange={(v) => setValue('rolId', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select defaultValue={usuario.estado} onValueChange={(v) => setValue('estado', v as EditarUsuarioInput['estado'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVO">Activo</SelectItem>
                  <SelectItem value="INACTIVO">Inactivo</SelectItem>
                  <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input {...register('telefonoE164')} placeholder="+57…" />
          </div>
          <SelectorSedes sedes={sedes} seleccionadas={sedeIds} onChange={(ids) => setValue('sedeIds', ids)} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Spinner />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

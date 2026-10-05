'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Mail, KeyRound } from 'lucide-react'
import {
  crearUsuarioSchema, editarUsuarioSchema,
  type CrearUsuarioInput, type EditarUsuarioInput,
} from '@/lib/validaciones/usuarios'
import { crearUsuario, editarUsuario, reenviarAcceso } from './acciones'
import { AvatarColaborador } from '@/components/ui-kit'
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
import { Ayuda } from '@/components/ui-kit/ayuda'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Pista } from '@/components/ui-kit/pista'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Encabezado } from '@/components/shell/encabezado'
import { SelectorMultiple } from '@/components/ui-kit/selector-multiple'

type Usuario = {
  id: string; nombre: string; email: string; fotoUrl: string | null; rolId: string; rolNombre: string
  rolIdsExtra: string[]; rolNombresExtra: string[]
  estado: string; telefonoE164: string | null; debeCambiarPassword: boolean
  ultimoAcceso: string | null; sedeIds: string[]; sedeNombres: string[]
}
type Rol = { id: string; nombre: string }
type Sede = { id: string; nombre: string; ciudad: string }

const ESTADO_VARIANTE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVO: 'default', SOLO_CONSULTA: 'outline', INACTIVO: 'secondary', BLOQUEADO: 'destructive',
}

/** Cómo se lee cada estado (el enum va en mayúsculas). */
const ESTADO_USUARIO: Record<string, string> = {
  ACTIVO: 'Activo', SOLO_CONSULTA: 'Solo consulta', INACTIVO: 'Inactivo', BLOQUEADO: 'Bloqueado',
}

export function UsuariosCliente({
  usuarios, roles, sedes, puedeCrear, puedeEditar,
}: {
  usuarios: Usuario[]; roles: Rol[]; sedes: Sede[]; puedeCrear: boolean; puedeEditar: boolean
}) {
  const [nuevo, setNuevo] = useState(false)
  const [editar, setEditar] = useState<Usuario | null>(null)

  return (
    <div>
      <Encabezado
        enLinea
        titulo="Usuarios"
        ayuda="Crea cuentas y asigna rol y sedes. La invitación llega por correo con una contraseña temporal. Con roles adicionales, sus permisos son la suma de todos."
        acciones={puedeCrear && <BotonAgregar etiqueta="Nuevo usuario" onClick={() => setNuevo(true)} />}
      />

      {/* Hasta xl, una fila por usuario (nombre arriba; rol, correo y sedes
          debajo). La tabla no cabía en el celular — Rol y Estado quedaban fuera
          de la pantalla — ni junto al menú de Ajustes en pantallas medianas. */}
      <Card className="py-0 xl:hidden"><CardContent className="divide-y p-0">
        {usuarios.map((u) => {
          const roles = [u.rolNombre, ...u.rolNombresExtra].join(', ')
          return (
            <div key={u.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <AvatarColaborador nombre={u.nombre} fotoUrl={u.fotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{u.nombre}</span>
                  {u.estado !== 'ACTIVO' && (
                    <Badge variant={ESTADO_VARIANTE[u.estado]}>{ESTADO_USUARIO[u.estado] ?? u.estado}</Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={`${roles} · ${u.email}`}>
                  {u.debeCambiarPassword && <span className="text-amber-600">Pendiente 1er ingreso · </span>}
                  {roles} · {u.email}
                  <span className="hidden sm:inline"> · {u.sedeNombres.length ? u.sedeNombres.join(', ') : 'Todas las sedes'}</span>
                </p>
              </div>
              {puedeEditar && (
                <>
                  <Pista texto="Editar">
                    <Button variant="ghost" size="icon" onClick={() => setEditar(u)} aria-label={`Editar ${u.nombre}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </Pista>
                  <ReenviarBoton id={u.id} nombre={u.nombre} correo={u.email} />
                </>
              )}
            </div>
          )
        })}
      </CardContent></Card>

      {/* Escritorio ancho: tabla de ancho fijo; los nombres largos se recortan
          en vez de empujar la tabla fuera del panel. */}
      <Card className="hidden py-0 xl:block"><CardContent className="p-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Usuario</TableHead>
              <TableHead className="w-[20%]">Rol</TableHead>
              <TableHead className="w-[18%]">Sedes</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              {puedeEditar && <TableHead className="w-[5.5rem]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5">
                    <AvatarColaborador nombre={u.nombre} fotoUrl={u.fotoUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={u.nombre}>{u.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground" title={u.email}>{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{u.rolNombre}</Badge>
                    {u.rolNombresExtra.map((n) => (
                      <Badge key={n} variant="secondary" title="Rol adicional">{n}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="truncate text-sm text-muted-foreground" title={u.sedeNombres.join(', ')}>
                  {u.sedeNombres.length ? u.sedeNombres.join(', ') : 'Todas'}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Badge variant={ESTADO_VARIANTE[u.estado]}>{ESTADO_USUARIO[u.estado] ?? u.estado}</Badge>
                  {u.debeCambiarPassword && (
                    <p className="mt-0.5 text-[10px] text-amber-600">Pendiente 1er ingreso</p>
                  )}
                </TableCell>
                {puedeEditar && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Pista texto="Editar">
                        <Button variant="ghost" size="icon" onClick={() => setEditar(u)} aria-label={`Editar ${u.nombre}`}>
                          <Pencil className="size-4" />
                        </Button>
                      </Pista>
                      <ReenviarBoton id={u.id} nombre={u.nombre} correo={u.email} />
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

/**
 * Reenviar acceso le CAMBIA la contraseña a la persona (la actual deja de
 * servir) y le manda una temporal por correo. Por eso pide confirmación: en el
 * celular un toque por error la dejaba sin poder entrar.
 */
function ReenviarBoton({ id, nombre, correo }: { id: string; nombre: string; correo: string }) {
  const [confirmar, setConfirmar] = useState(false)
  const [cargando, setCargando] = useState(false)
  async function reenviar() {
    setCargando(true)
    const res = await reenviarAcceso({ id })
    setCargando(false)
    setConfirmar(false)
    if (res.ok) toast.success(`Le enviamos una contraseña temporal a ${correo}.`)
    else toast.error(res.error)
  }
  return (
    <>
      <Pista texto="Reenviar acceso: contraseña temporal nueva por correo">
        <Button variant="ghost" size="icon" onClick={() => setConfirmar(true)} disabled={cargando} aria-label={`Reenviar acceso a ${nombre}`}>
          {cargando ? <Spinner /> : <KeyRound className="size-4" />}
        </Button>
      </Pista>
      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!cargando) setConfirmar(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reenviar acceso a {nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se le crea una contraseña temporal nueva y se le envía a {correo}. La que tiene ahora deja de servir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cargando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); reenviar() }} disabled={cargando}>
              {cargando && <Spinner />} Reenviar acceso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SelectorSedes({
  sedes, seleccionadas, onChange,
}: { sedes: Sede[]; seleccionadas: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="usuario-sedes" className="flex items-center gap-1.5">
        Sedes asignadas
        <Ayuda texto="Si no marcas ninguna, ve todas las sedes." etiqueta="Sobre las sedes asignadas" />
      </Label>
      <SelectorMultiple
        id="usuario-sedes" vacio="Todas las sedes" seleccionados={seleccionadas} onChange={onChange}
        opciones={sedes.map((s) => ({ valor: s.id, etiqueta: s.nombre, detalle: s.ciudad }))}
      />
    </div>
  )
}

/**
 * Roles adicionales al principal. El principal se excluye de la lista para que
 * no se pueda marcar dos veces, y se muestra deshabilitado como recordatorio.
 */
function SelectorRolesExtra({
  roles, rolPrincipalId, seleccionados, onChange,
}: { roles: Rol[]; rolPrincipalId: string; seleccionados: string[]; onChange: (ids: string[]) => void }) {
  const disponibles = roles.filter((r) => r.id !== rolPrincipalId)
  return (
    <div className="space-y-1.5">
      <Label htmlFor="usuario-roles-extra" className="flex items-center gap-1.5">
        Roles adicionales
        <Ayuda
          texto="Para quien cubre más de un frente a la vez. Sus permisos serán la suma del rol principal y estos; cuando un permiso llega por ambos, gana el alcance más amplio."
          etiqueta="Sobre los roles adicionales"
        />
      </Label>
      <SelectorMultiple
        id="usuario-roles-extra" vacio="Ninguno" seleccionados={seleccionados} onChange={onChange}
        opciones={disponibles.map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
      />
    </div>
  )
}

function DialogNuevo({ roles, sedes, onClose }: { roles: Rol[]; sedes: Sede[]; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CrearUsuarioInput>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { nombre: '', email: '', rolId: '', rolIdsExtra: [], telefonoE164: '', sedeIds: [] },
  })
  const sedeIds = watch('sedeIds')
  const rolId = watch('rolId')
  const rolIdsExtra = watch('rolIdsExtra')

  // Si el rol principal cambia a uno que estaba marcado como adicional, se
  // retira de los adicionales para no guardarlo por duplicado.
  function cambiarRolPrincipal(v: string) {
    setValue('rolId', v)
    setValue('rolIdsExtra', rolIdsExtra.filter((id) => id !== v))
  }

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
          <DialogDescription>Recibirá una contraseña temporal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre completo <span className="text-destructive">*</span></Label>
            <Input {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Correo electrónico <span className="text-destructive">*</span></Label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rol principal <span className="text-destructive">*</span></Label>
              <Select onValueChange={cambiarRolPrincipal}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent>
              </Select>
              {errors.rolId && <p className="text-xs text-destructive">{errors.rolId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input {...register('telefonoE164')} placeholder="+57…" />
            </div>
          </div>
          <SelectorRolesExtra
            roles={roles}
            rolPrincipalId={rolId}
            seleccionados={rolIdsExtra}
            onChange={(ids) => setValue('rolIdsExtra', ids)}
          />
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
  // Mientras el admin no toque la casilla, el reenvío sigue al correo: se marca
  // solo al corregirlo y se desmarca si lo devuelve al original.
  const [reenvioTocado, setReenvioTocado] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: {
      id: usuario.id, nombre: usuario.nombre, email: usuario.email, rolId: usuario.rolId,
      rolIdsExtra: usuario.rolIdsExtra,
      estado: usuario.estado as EditarUsuarioInput['estado'],
      telefonoE164: usuario.telefonoE164 ?? '', sedeIds: usuario.sedeIds,
      reenviarAcceso: false,
    },
  })
  const sedeIds = watch('sedeIds')
  const rolId = watch('rolId')
  const rolIdsExtra = watch('rolIdsExtra')
  const reenviar = watch('reenviarAcceso')
  const correoCambio = (watch('email') ?? '').trim().toLowerCase() !== usuario.email.toLowerCase()

  useEffect(() => {
    if (!reenvioTocado) setValue('reenviarAcceso', correoCambio)
  }, [correoCambio, reenvioTocado, setValue])

  function cambiarRolPrincipal(v: string) {
    setValue('rolId', v)
    setValue('rolIdsExtra', rolIdsExtra.filter((id) => id !== v))
  }

  async function onSubmit(datos: EditarUsuarioInput) {
    setGuardando(true)
    const res = await editarUsuario(datos)
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }
    const { correoCambiado, accesoEnviado, errorAcceso } = res.datos
    // Los datos ya quedaron guardados aunque el envío haya fallado: se avisa sin
    // decir que la operación falló, para que nadie la repita a ciegas.
    if (errorAcceso) {
      toast.warning(
        correoCambiado ? `Correo cambiado a ${datos.email}, pero ${errorAcceso}` : errorAcceso,
        { duration: 8000 },
      )
    } else {
      toast.success(
        accesoEnviado
          ? `Guardado. Se envió la contraseña temporal a ${datos.email}.`
          : correoCambiado
            ? 'Correo actualizado. No se envió contraseña nueva.'
            : 'Usuario actualizado.',
      )
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription className="truncate">Creado con {usuario.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre completo <span className="text-destructive">*</span></Label>
            <Input {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Correo electrónico <span className="text-destructive">*</span>
              <Ayuda
                texto="Es el correo con el que la persona inicia sesión. Si se registró mal, corrígelo aquí y marca el envío de una contraseña nueva: la anterior viajó al buzón equivocado."
                etiqueta="Sobre el correo de acceso"
              />
            </Label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            {correoCambio && (
              <p className="truncate text-xs text-amber-600">Se cerrarán sus sesiones abiertas.</p>
            )}
          </div>
          {/* El ⓘ va fuera del <label>: tocarlo no debe marcar la casilla. */}
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={reenviar}
                onCheckedChange={(v) => { setReenvioTocado(true); setValue('reenviarAcceso', Boolean(v)) }}
              />
              Enviar contraseña nueva
            </label>
            <Ayuda
              texto="Llega al correo de arriba. La contraseña anterior deja de servir y tendrá que crear una nueva al entrar."
              etiqueta="Sobre la contraseña temporal"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rol principal <span className="text-destructive">*</span></Label>
              <Select defaultValue={usuario.rolId} onValueChange={cambiarRolPrincipal}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado <span className="text-destructive">*</span></Label>
              <Select defaultValue={usuario.estado} onValueChange={(v) => setValue('estado', v as EditarUsuarioInput['estado'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVO">Activo</SelectItem>
                  {/* Entra y ve lo que su rol le deja ver, sin crear, editar, aprobar ni borrar. */}
                  <SelectItem value="SOLO_CONSULTA">Solo consulta</SelectItem>
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
          <SelectorRolesExtra
            roles={roles}
            rolPrincipalId={rolId}
            seleccionados={rolIdsExtra}
            onChange={(ids) => setValue('rolIdsExtra', ids)}
          />
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

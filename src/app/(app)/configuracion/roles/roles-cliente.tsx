'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, ListChecks, Lock, Pencil, Save, ChevronRight } from 'lucide-react'
import { ACCIONES, ACCIONES_EN_USO, GRUPOS_MODULOS, MODULOS_CON_ALCANCE, type Accion, type Alcance, type ModuloSistema } from '@/lib/permisos/modulos'
import { crearRol, editarRol, eliminarRol, guardarMatriz } from './acciones'
import { Button } from '@/components/ui/button'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Encabezado } from '@/components/shell/encabezado'
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
import { Pill } from '@/components/ui-kit'
import { cn } from '@/lib/utils'
import { Ayuda } from '@/components/ui-kit/ayuda'

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
    <div>
      <Encabezado
        enLinea
        titulo="Roles y permisos"
        ayuda="Qué módulos puede ver y editar cada rol, y con qué alcance de datos."
        acciones={puedeEditar && <BotonAgregar etiqueta="Nuevo rol" onClick={() => setNuevo(true)} />}
      />

      {/* Una fila por rol: nombre arriba; usuarios y descripción en un renglón. */}
      <Card className="py-0"><CardContent className="divide-y p-0">
        {roles.map((r) => (
          <div key={r.id} className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4">
            <span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:grid">
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{r.nombre}</span>
                {/* En el celular un candado en vez de la etiqueta: deja ver el nombre. */}
                {r.esSistema && (
                  <>
                    <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">Sistema</Badge>
                    <span className="shrink-0 text-muted-foreground sm:hidden" title="Rol del sistema">
                      <Lock className="size-3" aria-hidden /><span className="sr-only">Rol del sistema</span>
                    </span>
                  </>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={r.descripcion ?? undefined}>
                {r.usuarios} usuario(s)
                <span className="hidden sm:inline"> · {r.permisos.length} permisos</span>
                {r.descripcion && ` · ${r.descripcion}`}
              </p>
            </div>
            <Button variant="outline" className="max-sm:size-8 max-sm:px-0" onClick={() => setEditandoMatriz(r)} aria-label={`Permisos de ${r.nombre}`} title="Permisos">
              <ListChecks className="size-4" /> <span className="max-sm:sr-only">Permisos</span>
            </Button>
            {puedeEditar && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setEditandoRol(r)} aria-label={`Editar ${r.nombre}`} title="Editar">
                  <Pencil className="size-4" />
                </Button>
                {/* Ancho fijo: la papelera bloqueada mide distinto y descuadraba la columna. */}
                <span className="grid w-9 shrink-0 place-items-center">
                  <BotonEliminar
                    onEliminar={() => setEliminar(r)}
                    motivoBloqueo={r.esSistema ? 'No se puede eliminar: es un rol del sistema. Puedes ajustar sus permisos, pero no borrarlo.' : null}
                  />
                </span>
              </>
            )}
          </div>
        ))}
      </CardContent></Card>

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

type EstadoModulo = { acciones: Set<Accion>; alcance: Alcance }
type Nivel = 'nada' | 'ver' | 'todo'

/** Lo que tiene un módulo, en palabras: «Sin acceso», «Solo ver», «Todo» o la lista. */
function resumen(e: EstadoModulo, enUso: readonly Accion[]): { texto: string; tono: 'muted' | 'ok' | 'info' } {
  const marcadas = enUso.filter((a) => e.acciones.has(a))
  if (!marcadas.length) return { texto: 'Sin acceso', tono: 'muted' }
  if (marcadas.length === enUso.length) return { texto: enUso.length === 1 ? 'Ver' : 'Todo', tono: 'ok' }
  if (marcadas.length === 1) return { texto: 'Solo ver', tono: 'info' }
  const lista = marcadas.map((a) => ACCION_ETIQUETA[a].toLowerCase()).join(', ')
  return { texto: lista.charAt(0).toUpperCase() + lista.slice(1), tono: 'info' }
}

const AYUDA_ALCANCE = 'A quiénes alcanza: todas las sedes, solo las sedes asignadas al usuario, su equipo (las personas a su cargo) o solo sus propios datos.'
const AYUDA_PERMISOS = 'Cada usuario tiene un rol (y puede tener roles adicionales). El rol dice, por cada módulo, qué puede hacer: Ver le muestra el módulo en el menú; Crear, Editar, Eliminar, Aprobar y Exportar habilitan esos botones. El alcance dice a quiénes llega. Solo aparecen las acciones que cada módulo usa.'
const NIVELES: [Nivel, string][] = [['nada', 'Sin acceso'], ['ver', 'Solo ver'], ['todo', 'Todo']]

/**
 * Matriz de permisos de un rol: por módulo, qué acciones y con qué alcance.
 * Solo se muestran las acciones que el código revisa (ACCIONES_EN_USO) y el
 * alcance donde filtra algo; lo demás guardado se conserva tal cual al guardar.
 * Marcar cualquier acción marca Ver (sin ver no se llega a la pantalla), y
 * quitar Ver quita todo el módulo.
 */
function DialogMatriz({
  rol, modulos, puedeEditar, onClose,
}: { rol: Rol; modulos: Modulo[]; puedeEditar: boolean; onClose: () => void }) {
  const inicial: Record<string, EstadoModulo> = {}
  for (const m of modulos) {
    const permisos = rol.permisos.filter((p) => p.modulo === m.clave)
    inicial[m.clave] = {
      acciones: new Set(permisos.map((p) => p.accion as Accion)),
      alcance: (permisos[0]?.alcance as Alcance) ?? 'TODAS_SEDES',
    }
  }
  const [estado, setEstado] = useState(inicial)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const etiqueta: Record<string, string> = Object.fromEntries(modulos.map((m) => [m.clave, m.etiqueta]))
  const enUso = (m: string): readonly Accion[] => ACCIONES_EN_USO[m as ModuloSistema] ?? []

  function alternarAccion(modulo: string, accion: Accion, checked: boolean) {
    setEstado((prev) => {
      let acciones = new Set(prev[modulo].acciones)
      if (checked) { acciones.add(accion); acciones.add('VER') }
      else if (accion === 'VER') acciones = new Set()
      else acciones.delete(accion)
      return { ...prev, [modulo]: { ...prev[modulo], acciones } }
    })
  }
  function ponerNivel(modulo: string, nivel: Nivel) {
    setEstado((prev) => {
      const acciones = nivel === 'nada' ? new Set<Accion>() : nivel === 'ver' ? new Set<Accion>(['VER']) : new Set<Accion>([...prev[modulo].acciones, ...enUso(modulo)])
      return { ...prev, [modulo]: { ...prev[modulo], acciones } }
    })
  }
  function cambiarAlcance(modulo: string, alcance: Alcance) {
    setEstado((prev) => ({ ...prev, [modulo]: { ...prev[modulo], alcance } }))
  }
  function alternarAbierto(m: string) {
    setAbiertos((prev) => { const n = new Set(prev); if (n.has(m)) n.delete(m); else n.add(m); return n })
  }

  async function guardar() {
    setGuardando(true)
    const permisos = modulos.flatMap((m) =>
      [...estado[m.clave].acciones].map((accion) => ({ modulo: m.clave, accion, alcance: estado[m.clave].alcance })),
    )
    const res = await guardarMatriz({ rolId: rol.id, permisos })
    setGuardando(false)
    if (res.ok) { toast.success('Permisos guardados.'); onClose() }
    else toast.error(res.error)
  }

  const grupos = GRUPOS_MODULOS.map((g) => ({ ...g, modulos: g.modulos.filter((m) => m in estado) })).filter((g) => g.modulos.length)
  const selectorAlcance = (m: string) => (
    <Select disabled={!puedeEditar || !estado[m].acciones.size} value={estado[m].alcance} onValueChange={(v) => cambiarAlcance(m, v as Alcance)}>
      <SelectTrigger size="sm" className="w-full" aria-label={`Alcance de ${etiqueta[m]}`}><SelectValue /></SelectTrigger>
      <SelectContent>{ALCANCES.map((al) => <SelectItem key={al.valor} value={al.valor}>{al.etiqueta}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Sin foco inicial: caería en el (?) del título y su globo taparía la lista. */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="flex max-h-[88dvh] w-[min(96vw,1080px)] flex-col overflow-hidden sm:max-w-[1080px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Permisos · {rol.nombre}
            <Ayuda etiqueta="Cómo funcionan los permisos" texto={AYUDA_PERMISOS} />
          </DialogTitle>
          <DialogDescription>{puedeEditar ? 'Toca un módulo para elegir qué puede hacer.' : 'Solo lectura.'}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          {/* Escritorio: la tabla, por grupos; «—» donde la acción no existe en ese módulo. */}
          <table className="hidden w-full text-sm lg:table">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left">
                <th className="w-[36%] py-2 font-medium">Módulo</th>
                {ACCIONES.map((a) => <th key={a} className="w-[7.5%] px-1 py-2 text-center text-xs font-medium">{ACCION_ETIQUETA[a]}</th>)}
                <th className="py-2 pl-2 font-medium"><span className="inline-flex items-center gap-1">Alcance <Ayuda etiqueta="Sobre el alcance" texto={AYUDA_ALCANCE} /></span></th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.titulo}>
                <tr><td colSpan={ACCIONES.length + 2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</td></tr>
                {g.modulos.map((m) => (
                  <tr key={m} className="border-b last:border-0">
                    <td className="py-2 pr-2">{etiqueta[m]}</td>
                    {ACCIONES.map((a) => (
                      <td key={a} className="px-1 py-2 text-center">
                        {enUso(m).includes(a)
                          ? <Checkbox disabled={!puedeEditar} checked={estado[m].acciones.has(a)} onCheckedChange={(v) => alternarAccion(m, a, Boolean(v))} aria-label={`${ACCION_ETIQUETA[a]} en ${etiqueta[m]}`} />
                          : <span className="text-muted-foreground/40" aria-hidden>—</span>}
                      </td>
                    ))}
                    <td className="w-[17%] py-2 pl-2">
                      {MODULOS_CON_ALCANCE.includes(m) ? selectorAlcance(m) : <span className="text-xs text-muted-foreground/60">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>

          {/* Celular: un acordeón por módulo. Cerrado se ve el resumen; abierto,
              los atajos (sin acceso / solo ver / todo), las acciones y el alcance. */}
          <div className="space-y-4 lg:hidden">
            {grupos.map((g) => (
              <section key={g.titulo}>
                <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.titulo}
                  <span className="font-normal normal-case tracking-normal">{g.modulos.filter((m) => estado[m].acciones.size).length} de {g.modulos.length} con acceso</span>
                </p>
                <div className="divide-y rounded-lg border">
                  {g.modulos.map((m) => {
                    const r = resumen(estado[m], enUso(m))
                    const abierto = abiertos.has(m)
                    const marcadas = enUso(m).filter((a) => estado[m].acciones.has(a)).length
                    const nivel: Nivel | null = marcadas === 0 ? 'nada' : marcadas === enUso(m).length ? 'todo' : marcadas === 1 ? 'ver' : null
                    return (
                      <div key={m}>
                        <button type="button" onClick={() => alternarAbierto(m)} aria-expanded={abierto} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} />
                          <span className="min-w-0 flex-1 text-sm font-medium">{etiqueta[m]}</span>
                          <Pill tone={r.tono} className="max-w-[45%] shrink-0 truncate">{r.texto}</Pill>
                        </button>
                        {abierto && (
                          <div className="space-y-3 px-3 pb-3 pl-9">
                            {puedeEditar && enUso(m).length > 1 && (
                              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
                                {NIVELES.map(([k, t]) => (
                                  <button key={k} type="button" onClick={() => ponerNivel(m, k)} className={cn('rounded-md py-1.5 font-medium', nivel === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{t}</button>
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              {enUso(m).map((a) => (
                                <label key={a} className="flex items-center gap-2 text-sm">
                                  <Checkbox disabled={!puedeEditar} checked={estado[m].acciones.has(a)} onCheckedChange={(v) => alternarAccion(m, a, Boolean(v))} />
                                  {ACCION_ETIQUETA[a]}
                                </label>
                              ))}
                            </div>
                            {MODULOS_CON_ALCANCE.includes(m) && estado[m].acciones.size > 0 && (
                              <div className="space-y-1">
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">Alcance <Ayuda etiqueta="Sobre el alcance" texto={AYUDA_ALCANCE} /></p>
                                {selectorAlcance(m)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
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
          <DialogDescription>{rol ? `${rol.usuarios} usuario(s) con este rol.` : 'Los permisos se marcan después.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
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

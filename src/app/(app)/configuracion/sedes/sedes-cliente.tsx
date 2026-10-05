'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Pencil, Building2, MapPin, Star } from 'lucide-react'
import { sedeSchema, ciudadSchema, type SedeInput, type CiudadInput } from '@/lib/validaciones/catalogos'
import { crearSede, editarSede, crearCiudad, editarCiudad, eliminarCiudad } from './acciones'
import { Button } from '@/components/ui/button'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { cn } from '@/lib/utils'

type Sede = {
  id: string; nombre: string; ciudadId: string; ciudadNombre: string
  direccion: string; telefono: string | null; esPrincipal: boolean; activa: boolean
}
type Ciudad = { id: string; nombre: string; departamento: string; codigoDane: string; enUso: number }

export function SedesCliente({
  sedes, ciudades, puedeCrear, puedeEditar, puedeEliminar,
}: {
  sedes: Sede[]; ciudades: Ciudad[]; puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean
}) {
  const [editar, setEditar] = useState<Sede | null>(null)
  const [nuevaSede, setNuevaSede] = useState(false)
  const [nuevaCiudad, setNuevaCiudad] = useState(false)
  const [editarCiudadItem, setEditarCiudadItem] = useState<Ciudad | null>(null)
  const router = useRouter()

  async function borrarCiudad(c: Ciudad) {
    if (!confirm(`¿Eliminar la ciudad "${c.nombre}"?`)) return
    const res = await eliminarCiudad({ id: c.id })
    if (res.ok) { toast.success('Ciudad eliminada.'); router.refresh() }
    else toast.error(res.error)
  }

  const [vista, setVista] = useState<'sedes' | 'ciudades'>('sedes')
  const nueva = vista === 'sedes' ? 'Nueva sede' : 'Nueva ciudad'

  return (
    <div className="space-y-3">
      {/* Arriba, qué se ve (sedes o ciudades) y el + para crear: sin títulos ni textos de más. */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 gap-1.5 overflow-x-auto">
          {([['sedes', 'Sedes', sedes.length, Building2], ['ciudades', 'Ciudades', ciudades.length, MapPin]] as const).map(([k, titulo, n, Icono]) => (
            <button
              key={k} type="button" onClick={() => setVista(k)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors', vista === k ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}
            >
              <Icono className="size-4" /> {titulo}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', vista === k ? 'bg-background/20' : 'bg-muted text-muted-foreground')}>{n}</span>
            </button>
          ))}
        </div>
        {puedeCrear && (
          <BotonAgregar
            etiqueta={nueva} className="ml-auto"
            onClick={() => (vista === 'sedes' ? setNuevaSede(true) : setNuevaCiudad(true))}
            disabled={vista === 'sedes' && ciudades.length === 0}
          />
        )}
      </div>

      {vista === 'sedes' && (ciudades.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Primero crea una ciudad.</CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {sedes.map((s) => (
            <div key={s.id} className={cn('flex items-center gap-3 px-3 py-2.5 sm:px-4', !s.activa && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {s.esPrincipal && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Sede principal" />}
                  <span className="truncate">{s.nombre}</span>
                  {!s.activa && <Badge variant="secondary">Inactiva</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={s.direccion}>
                  {s.ciudadNombre}{s.direccion ? ` · ${s.direccion}` : ''}
                </p>
              </div>
              {puedeEditar && (
                <Button variant="ghost" size="icon" onClick={() => setEditar(s)} aria-label={`Editar ${s.nombre}`} title="Editar">
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent></Card>
      ))}

      {vista === 'ciudades' && (ciudades.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no hay ciudades.</CardContent></Card>
      ) : (
        <Card className="py-0"><CardContent className="divide-y p-0">
          {ciudades.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nombre}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.departamento, c.codigoDane && `DANE ${c.codigoDane}`, c.enUso ? `${c.enUso} en uso` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              {puedeEditar && (
                <Button size="icon" variant="ghost" onClick={() => setEditarCiudadItem(c)} aria-label={`Editar ${c.nombre}`} title="Editar">
                  <Pencil className="size-4" />
                </Button>
              )}
              {/* La papelera queda visible pero inerte cuando la ciudad está en uso,
                  para que se vea POR QUÉ no se puede borrar; el servidor lo revalida igual. */}
              {puedeEliminar && (
                <BotonEliminar
                  onEliminar={() => borrarCiudad(c)}
                  etiqueta={`Eliminar ${c.nombre}`}
                  motivoBloqueo={c.enUso > 0 ? `No se puede eliminar: la ciudad está en uso en ${c.enUso} registro(s), entre sedes y colaboradores.` : null}
                />
              )}
            </div>
          ))}
        </CardContent></Card>
      ))}

      {(nuevaSede || editar) && (
        <DialogSede
          ciudades={ciudades}
          sede={editar}
          onClose={() => { setNuevaSede(false); setEditar(null) }}
        />
      )}
      {(nuevaCiudad || editarCiudadItem) && (
        <DialogCiudad
          ciudad={editarCiudadItem}
          onClose={() => { setNuevaCiudad(false); setEditarCiudadItem(null) }}
        />
      )}
    </div>
  )
}

function DialogSede({ ciudades, sede, onClose }: { ciudades: Ciudad[]; sede: Sede | null; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SedeInput>({
    resolver: zodResolver(sedeSchema),
    defaultValues: sede
      ? { nombre: sede.nombre, ciudadId: sede.ciudadId, direccion: sede.direccion, telefono: sede.telefono ?? '', esPrincipal: sede.esPrincipal, activa: sede.activa }
      : { nombre: '', ciudadId: '', direccion: '', telefono: '', esPrincipal: false, activa: true },
  })

  async function onSubmit(datos: SedeInput) {
    setGuardando(true)
    const res = sede ? await editarSede({ ...datos, id: sede.id }) : await crearSede(datos)
    setGuardando(false)
    if (res.ok) { toast.success(sede ? 'Sede actualizada.' : 'Sede creada.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sede ? 'Editar sede' : 'Nueva sede'}</DialogTitle>
          <DialogDescription>Los datos identifican la sede en toda la plataforma.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input {...register('nombre')} placeholder="Sede Centro" />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Ciudad</Label>
            <Select defaultValue={sede?.ciudadId} onValueChange={(v) => setValue('ciudadId', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {ciudades.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} · {c.departamento}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.ciudadId && <p className="text-xs text-destructive">{errors.ciudadId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input {...register('direccion')} />
            {errors.direccion && <p className="text-xs text-destructive">{errors.direccion.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input {...register('telefono')} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="principal">Sede principal</Label>
            <Switch id="principal" defaultChecked={sede?.esPrincipal} onCheckedChange={(v) => setValue('esPrincipal', v)} />
          </div>
          {sede && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="activa">Activa</Label>
              <Switch id="activa" defaultChecked={sede?.activa} onCheckedChange={(v) => setValue('activa', v)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Spinner />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogCiudad({ ciudad, onClose }: { ciudad: Ciudad | null; onClose: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<CiudadInput>({
    resolver: zodResolver(ciudadSchema),
    defaultValues: ciudad
      ? { nombre: ciudad.nombre, departamento: ciudad.departamento, codigoDane: ciudad.codigoDane }
      : { nombre: '', departamento: '', codigoDane: '' },
  })

  async function onSubmit(datos: CiudadInput) {
    setGuardando(true)
    const res = ciudad ? await editarCiudad({ ...datos, id: ciudad.id }) : await crearCiudad(datos)
    setGuardando(false)
    if (res.ok) { toast.success(ciudad ? 'Ciudad actualizada.' : 'Ciudad creada.'); onClose() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ciudad ? 'Editar ciudad' : 'Nueva ciudad'}</DialogTitle>
          <DialogDescription>El código DANE es útil para ICA por municipio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input {...register('nombre')} placeholder="Cali" />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Departamento</Label>
            <Input {...register('departamento')} placeholder="Valle del Cauca" />
            {errors.departamento && <p className="text-xs text-destructive">{errors.departamento.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Código DANE (opcional)</Label>
            <Input {...register('codigoDane')} placeholder="76001" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Spinner />}Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

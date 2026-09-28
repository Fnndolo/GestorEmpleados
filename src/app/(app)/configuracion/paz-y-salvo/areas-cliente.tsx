'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, ChevronUp, ChevronDown, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pill } from '@/components/ui-kit'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { cn } from '@/lib/utils'
import { crearAreaPazYSalvo, editarAreaPazYSalvo, alternarAreaPazYSalvo, moverAreaPazYSalvo, eliminarAreaPazYSalvo } from './acciones'

type Chequeo = 'ACTIVOS' | 'PRESTAMOS' | null
type Area = { id: string; nombre: string; concepto: string; chequeo: Chequeo; responsableId: string | null; responsableNombre: string | null; activa: boolean }
type Usuario = { id: string; nombre: string; email: string }

const NINGUNO = '__ninguno__'
const CHEQUEO: Record<'ACTIVOS' | 'PRESTAMOS', string> = { ACTIVOS: 'Avisa activos sin devolver', PRESTAMOS: 'Avisa préstamo con saldo' }

type Formulario = { nombre: string; concepto: string; responsableId: string | null; chequeo: Chequeo }
const VACIO: Formulario = { nombre: '', concepto: '', responsableId: null, chequeo: null }

/**
 * Las áreas que verifican la entrega de quien se retira. Cada una, con su
 * responsable: le llega el aviso y verifica su parte desde su autoservicio. Sin
 * responsable, la verifica Talento Humano.
 */
export function AreasPazYSalvoCliente({ puedeCrear, puedeEditar, puedeEliminar, areas, usuarios }: {
  puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean
  areas: Area[]; usuarios: Usuario[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Area | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState<Formulario>(VACIO)

  function abrir(a: Area | null) {
    setEditando(a)
    setF(a ? { nombre: a.nombre, concepto: a.concepto, responsableId: a.responsableId, chequeo: a.chequeo } : VACIO)
    setAbierto(true)
  }

  async function guardar() {
    setGuardando(true)
    const res = editando ? await editarAreaPazYSalvo({ id: editando.id, ...f }) : await crearAreaPazYSalvo(f)
    setGuardando(false)
    if (res.ok) { toast.success(editando ? 'Área actualizada.' : 'Área creada.'); setAbierto(false); router.refresh() }
    else toast.error(res.error)
  }

  async function ejecutar(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p
    if (res.ok) router.refresh(); else toast.error(res.error ?? 'No se pudo.')
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {areas.filter((a) => a.activa).length} áreas activas
          <Ayuda texto="Al registrar una terminación, cada área activa pasa al checklist del paz y salvo. Su responsable recibe el aviso y verifica la entrega desde su autoservicio; sin responsable, la verifica Talento Humano. Los cambios aplican a las terminaciones nuevas." />
        </p>
        {puedeCrear && <Button size="sm" onClick={() => abrir(null)}><Plus className="size-4" /> Nueva área</Button>}
      </div>

      <Card className="py-0"><CardContent className="divide-y p-0">
        {areas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin áreas: se usarán las de fábrica.</p>
        ) : areas.map((a, i) => (
          <div key={a.id} className={cn('flex items-center gap-2 p-3', !a.activa && 'opacity-60')}>
            {puedeEditar && (
              <div className="flex flex-col">
                <Button size="icon" variant="ghost" className="size-6" disabled={i === 0} aria-label="Subir" onClick={() => ejecutar(moverAreaPazYSalvo({ id: a.id, direccion: 'arriba' }))}>
                  <ChevronUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-6" disabled={i === areas.length - 1} aria-label="Bajar" onClick={() => ejecutar(moverAreaPazYSalvo({ id: a.id, direccion: 'abajo' }))}>
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium">{a.nombre}</p>
                {a.chequeo && <Pill tone="info">{CHEQUEO[a.chequeo]}</Pill>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{a.concepto}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs">
                <UserRound className="size-3 shrink-0 text-muted-foreground" />
                <span className={cn('truncate', !a.responsableNombre && 'text-muted-foreground')}>{a.responsableNombre ?? 'Talento Humano'}</span>
              </p>
            </div>
            {puedeEditar && (
              <>
                <Switch checked={a.activa} onCheckedChange={() => ejecutar(alternarAreaPazYSalvo({ id: a.id, activa: !a.activa }))} aria-label="Activa" />
                <Button size="icon" variant="ghost" onClick={() => abrir(a)} aria-label="Editar"><Pencil className="size-4" /></Button>
              </>
            )}
            {puedeEliminar && (
              <BotonEliminar onEliminar={() => { if (confirm(`¿Eliminar el área "${a.nombre}"?`)) ejecutar(eliminarAreaPazYSalvo({ id: a.id })) }} />
            )}
          </div>
        ))}
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editando ? 'Editar área' : 'Nueva área'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="area-nombre">Área</Label>
              <Input id="area-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Sistemas" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area-concepto">Qué verifica</Label>
              <Input id="area-concepto" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej: Accesos y correos revocados" />
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={f.responsableId ?? NINGUNO} onValueChange={(v) => setF({ ...f, responsableId: v === NINGUNO ? null : v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Talento Humano</SelectItem>
                  {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre} · {u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Alerta automática</Label>
              <Select value={f.chequeo ?? NINGUNO} onValueChange={(v) => setF({ ...f, chequeo: v === NINGUNO ? null : (v as Chequeo) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Ninguna</SelectItem>
                  <SelectItem value="ACTIVOS">Activos sin devolver</SelectItem>
                  <SelectItem value="PRESTAMOS">Préstamo con saldo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

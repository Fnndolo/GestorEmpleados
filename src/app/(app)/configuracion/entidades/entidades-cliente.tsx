'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { crearEntidad, editarEntidad, alternarEntidad, crearBanco, editarBanco, alternarBanco } from './acciones'
import { TIPOS_ENTIDAD_SS } from '@/lib/validaciones/catalogos'

type TipoEntidad = (typeof TIPOS_ENTIDAD_SS)[number]
type Entidad = { id: string; tipo: TipoEntidad; nombre: string; codigo: string; activa: boolean; asignados: number }
type Banco = { id: string; nombre: string; codigoAch: string; activo: boolean; asignados: number }

/** "Bancos" no es un TipoEntidadSS: vive en su propia tabla, pero comparte pantalla. */
const BANCOS = '__bancos__'
type Pestana = TipoEntidad | typeof BANCOS

const ETIQUETAS: Record<Pestana, { plural: string; singular: string; codigo: string; ayudaCodigo: string }> = {
  EPS: { plural: 'EPS', singular: 'EPS', codigo: 'Código PILA', ayudaCodigo: 'Código del operador en la planilla PILA.' },
  ARL: { plural: 'ARL', singular: 'ARL', codigo: 'Código PILA', ayudaCodigo: 'Código del operador en la planilla PILA.' },
  AFP: { plural: 'Pensiones', singular: 'fondo de pensiones', codigo: 'Código PILA', ayudaCodigo: 'Código del operador en la planilla PILA.' },
  FONDO_CESANTIAS: { plural: 'Cesantías', singular: 'fondo de cesantías', codigo: 'Código PILA', ayudaCodigo: 'Código del operador en la planilla PILA.' },
  CAJA_COMPENSACION: { plural: 'Cajas', singular: 'caja de compensación', codigo: 'Código PILA', ayudaCodigo: 'Código del operador en la planilla PILA.' },
  [BANCOS]: { plural: 'Bancos', singular: 'banco', codigo: 'Código ACH', ayudaCodigo: 'Código del banco para el archivo de dispersión de nómina.' },
}

const PESTANAS: Pestana[] = [...TIPOS_ENTIDAD_SS, BANCOS]

type Formulario = { nombre: string; codigo: string; activo: boolean }
const VACIO: Formulario = { nombre: '', codigo: '', activo: true }

export function EntidadesCliente({
  puedeCrear,
  puedeEditar,
  entidades,
  bancos,
}: {
  puedeCrear: boolean
  puedeEditar: boolean
  entidades: Entidad[]
  bancos: Banco[]
}) {
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>('EPS')
  const [abierto, setAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState<Formulario>(VACIO)

  const etiqueta = ETIQUETAS[pestana]

  function abrirNuevo() {
    setEditandoId(null)
    setF(VACIO)
    setAbierto(true)
  }

  function abrirEditar(item: Entidad | Banco) {
    setEditandoId(item.id)
    setF(
      'activa' in item
        ? { nombre: item.nombre, codigo: item.codigo, activo: item.activa }
        : { nombre: item.nombre, codigo: item.codigoAch, activo: item.activo },
    )
    setAbierto(true)
  }

  async function guardar() {
    if (!f.nombre.trim()) {
      toast.error('Indica el nombre.')
      return
    }
    setGuardando(true)
    const res =
      pestana === BANCOS
        ? editandoId
          ? await editarBanco({ id: editandoId, nombre: f.nombre, codigoAch: f.codigo, activo: f.activo })
          : await crearBanco({ nombre: f.nombre, codigoAch: f.codigo, activo: f.activo })
        : editandoId
          ? await editarEntidad({ id: editandoId, tipo: pestana, nombre: f.nombre, codigo: f.codigo, activa: f.activo })
          : await crearEntidad({ tipo: pestana, nombre: f.nombre, codigo: f.codigo, activa: f.activo })
    setGuardando(false)
    if (res.ok) {
      toast.success(editandoId ? 'Cambios guardados.' : 'Registro creado.')
      setAbierto(false)
      router.refresh()
    } else toast.error(res.error)
  }

  async function alternar(item: Entidad | Banco) {
    const res =
      'activa' in item
        ? await alternarEntidad({ id: item.id, activa: !item.activa })
        : await alternarBanco({ id: item.id, activo: !item.activo })
    if (res.ok) router.refresh()
    else toast.error(res.error)
  }

  function Lista({ items }: { items: (Entidad | Banco)[] }) {
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay registros aquí. Usa «Agregar» para crear el primero.
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardContent className="p-0 divide-y">
          {items.map((item) => {
            const activo = 'activa' in item ? item.activa : item.activo
            const codigo = 'activa' in item ? item.codigo : item.codigoAch
            return (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.nombre}</p>
                    {!activo && <Badge variant="secondary">Inactivo</Badge>}
                    {codigo && <Badge variant="outline">{codigo}</Badge>}
                  </div>
                  {item.asignados > 0 && (
                    <p className="text-xs text-muted-foreground">{item.asignados} colaborador(es)</p>
                  )}
                </div>
                {puedeEditar && (
                  <>
                    <Switch checked={activo} onCheckedChange={() => alternar(item)} />
                    <Button size="sm" variant="outline" onClick={() => abrirEditar(item)}>
                      <Pencil className="size-4" /> Editar
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {PESTANAS.map((p) => (
                <TabsTrigger key={p} value={p}>
                  {ETIQUETAS[p].plural}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {puedeCrear && (
            <Button size="sm" onClick={abrirNuevo} className="sm:shrink-0">
              <Plus className="size-4" /> Agregar
            </Button>
          )}
        </div>

        {TIPOS_ENTIDAD_SS.map((t) => (
          <TabsContent key={t} value={t}>
            <Lista items={entidades.filter((e) => e.tipo === t)} />
          </TabsContent>
        ))}
        <TabsContent value={BANCOS}>
          <Lista items={bancos} />
        </TabsContent>
      </Tabs>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editandoId ? `Editar ${etiqueta.singular}` : `Nueva ${etiqueta.singular}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{etiqueta.codigo} (opcional)</Label>
              <Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
              <p className="text-xs text-muted-foreground">{etiqueta.ayudaCodigo}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} />
              <Label className="font-normal">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Spinner />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

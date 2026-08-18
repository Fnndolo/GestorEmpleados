'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearTipoDocumento, editarTipoDocumento, alternarTipoDocumento, eliminarTipoDocumento } from './acciones'
import type { TipoDocumentoInput } from '@/lib/validaciones/catalogos'
import { Ayuda } from '@/components/ui-kit/ayuda'

type Vinculo = TipoDocumentoInput['vinculosObligatorios'][number]
type Tipo = {
  id: string; nombre: string; descripcion: string; requiereVencimiento: boolean
  nivelAcceso: string; diasPrimeraAlerta: number | null; diasUltimaAlerta: number | null
  activo: boolean; vinculosObligatorios: string[]; documentos: number
}

const VINCULOS: { v: Vinculo; l: string }[] = [
  { v: 'TERMINO_INDEFINIDO', l: 'Término indefinido' },
  { v: 'TERMINO_FIJO', l: 'Término fijo' },
  { v: 'OBRA_LABOR', l: 'Obra o labor' },
  { v: 'APRENDIZ_SENA', l: 'Aprendiz SENA' },
  { v: 'OPS', l: 'Prestación de servicios (OPS)' },
  { v: 'PRACTICANTE', l: 'Practicante' },
]

const NIVELES: { v: string; l: string }[] = [
  { v: 'GENERAL', l: 'General — cualquiera con acceso al expediente' },
  { v: 'RRHH', l: 'Talento Humano' },
  { v: 'SST_MEDICO', l: 'SST / médico (dato sensible)' },
  { v: 'JURIDICA', l: 'Jurídica' },
  { v: 'ADMIN', l: 'Solo administrador' },
]

type Formulario = {
  nombre: string; descripcion: string; requiereVencimiento: boolean; nivelAcceso: string
  diasPrimeraAlerta: string; diasUltimaAlerta: string; activo: boolean; vinculos: Vinculo[]
}
const VACIO: Formulario = {
  nombre: '', descripcion: '', requiereVencimiento: false, nivelAcceso: 'GENERAL',
  diasPrimeraAlerta: '', diasUltimaAlerta: '', activo: true, vinculos: [],
}

export function TiposDocumentoCliente({
  puedeCrear, puedeEditar, puedeEliminar, tipos,
}: {
  puedeCrear: boolean; puedeEditar: boolean; puedeEliminar: boolean; tipos: Tipo[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Tipo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState<Formulario>(VACIO)

  function abrirNuevo() {
    setEditando(null)
    setF(VACIO)
    setAbierto(true)
  }
  function abrirEditar(t: Tipo) {
    setEditando(t)
    setF({
      nombre: t.nombre,
      descripcion: t.descripcion,
      requiereVencimiento: t.requiereVencimiento,
      nivelAcceso: t.nivelAcceso,
      diasPrimeraAlerta: t.diasPrimeraAlerta?.toString() ?? '',
      diasUltimaAlerta: t.diasUltimaAlerta?.toString() ?? '',
      activo: t.activo,
      vinculos: t.vinculosObligatorios as Vinculo[],
    })
    setAbierto(true)
  }

  function alternarVinculo(v: Vinculo, marcado: boolean) {
    setF({ ...f, vinculos: marcado ? [...f.vinculos, v] : f.vinculos.filter((x) => x !== v) })
  }

  async function guardar() {
    if (!f.nombre.trim()) { toast.error('Indica el nombre del documento.'); return }
    const aNumero = (s: string) => (s.trim() === '' ? null : Number(s))
    const payload = {
      nombre: f.nombre,
      descripcion: f.descripcion,
      requiereVencimiento: f.requiereVencimiento,
      nivelAcceso: f.nivelAcceso as TipoDocumentoInput['nivelAcceso'],
      diasPrimeraAlerta: aNumero(f.diasPrimeraAlerta),
      diasUltimaAlerta: aNumero(f.diasUltimaAlerta),
      activo: f.activo,
      vinculosObligatorios: f.vinculos,
    }
    setGuardando(true)
    const res = editando
      ? await editarTipoDocumento({ id: editando.id, ...payload })
      : await crearTipoDocumento(payload)
    setGuardando(false)
    if (res.ok) {
      toast.success(editando ? 'Tipo actualizado.' : 'Tipo creado.')
      setAbierto(false)
      router.refresh()
    } else toast.error(res.error)
  }

  async function alternar(t: Tipo) {
    const res = await alternarTipoDocumento({ id: t.id, activo: !t.activo })
    if (res.ok) router.refresh(); else toast.error(res.error)
  }

  async function eliminar(t: Tipo) {
    if (!confirm(`¿Eliminar el tipo "${t.nombre}"? Esta acción no se puede deshacer.`)) return
    const res = await eliminarTipoDocumento({ id: t.id })
    if (res.ok) { toast.success('Tipo eliminado.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <>
      {puedeCrear && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={abrirNuevo}><Plus className="size-4" /> Nuevo tipo</Button>
        </div>
      )}

      <Card><CardContent className="p-0 divide-y">
        {tipos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aún no hay tipos de documento. Crea el primero para armar el expediente.
          </p>
        ) : tipos.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t.nombre}</p>
                {!t.activo && <Badge variant="secondary">Inactivo</Badge>}
                {t.requiereVencimiento && <Badge variant="outline">Con vencimiento</Badge>}
                {t.nivelAcceso !== 'GENERAL' && <Badge variant="outline">{t.nivelAcceso}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.vinculosObligatorios.length > 0
                  ? `Obligatorio en ${t.vinculosObligatorios.length} tipo(s) de vínculo`
                  : 'Opcional en todos los vínculos'}
                {t.documentos > 0 && ` · ${t.documentos} cargado(s)`}
              </p>
            </div>
            {puedeEditar && (
              <>
                <Switch checked={t.activo} onCheckedChange={() => alternar(t)} />
                <Button size="sm" variant="outline" onClick={() => abrirEditar(t)}>
                  <Pencil className="size-4" /> Editar
                </Button>
              </>
            )}
            {puedeEliminar && (
              <BotonEliminar
                onEliminar={() => eliminar(t)}
                motivoBloqueo={t.documentos > 0 ? `No se puede eliminar: hay ${t.documentos} documento(s) cargado(s) de este tipo. Desactívalo si ya no se debe usar.` : null}
              />
            )}
          </div>
        ))}
      </CardContent></Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Nivel de acceso
                <Ayuda texto="Restringe quién puede ver los archivos de este tipo dentro del expediente." etiqueta="Sobre el nivel de acceso" />
              </Label>
              <Select value={f.nivelAcceso} onValueChange={(v) => setF({ ...f, nivelAcceso: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVELES.map((n) => <SelectItem key={n.v} value={n.v}>{n.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={f.requiereVencimiento}
                onCheckedChange={(v) => setF({ ...f, requiereVencimiento: v })}
              />
              <Label className="font-normal">Tiene fecha de vencimiento</Label>
            </div>
            {f.requiereVencimiento && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Primera alerta (días antes)
                    <Ayuda texto="Déjalo vacío para usar los días configurados en Reglas de alerta." etiqueta="Sobre los días de alerta" />
                  </Label>
                  <Input
                    type="number" min={1} max={365} value={f.diasPrimeraAlerta}
                    onChange={(e) => setF({ ...f, diasPrimeraAlerta: e.target.value })}
                    placeholder="Regla global"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Última alerta (días antes)</Label>
                  <Input
                    type="number" min={1} max={365} value={f.diasUltimaAlerta}
                    onChange={(e) => setF({ ...f, diasUltimaAlerta: e.target.value })}
                    placeholder="Regla global"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Obligatorio para estos vínculos
                <Ayuda texto="Si no marcas ninguno, el documento queda disponible pero nunca se exige." etiqueta="Sobre los vínculos obligatorios" />
              </Label>
              <div className="space-y-2 rounded-lg border p-3">
                {VINCULOS.map((v) => (
                  <label key={v.v} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={f.vinculos.includes(v.v)}
                      onCheckedChange={(c) => alternarVinculo(v.v, Boolean(c))}
                    />
                    {v.l}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} />
              <Label className="font-normal">Activo</Label>
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

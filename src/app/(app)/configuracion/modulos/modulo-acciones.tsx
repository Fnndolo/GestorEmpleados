'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, ListChecks, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { Pista } from '@/components/ui-kit/pista'
import { DialogMotivo } from '../dialog-motivo'
import { editarModulo, eliminarModulo, editarCampo, eliminarCampo } from './acciones'

export type ModuloItem = {
  id: string; slug: string; nombre: string; descripcion: string | null; icono: string; seccion: string
  vinculo: 'GLOBAL' | 'POR_COLABORADOR' | 'POR_SEDE'; registros: number
  campos: CampoItem[]
}
export type CampoItem = {
  id: string; clave: string; etiqueta: string; tipo: string; requerido: boolean; opciones: string | null
  generaAlerta: boolean; mostrarEnTabla: boolean
  /** Registros que ya tienen valor en este campo: con alguno no se borra ni se le cambia el tipo. */
  conValor: number
}

const TIPOS = [
  { v: 'TEXTO', l: 'Texto' }, { v: 'TEXTO_LARGO', l: 'Texto largo' }, { v: 'NUMERO', l: 'Número' },
  { v: 'DECIMAL', l: 'Decimal' }, { v: 'MONEDA', l: 'Moneda' }, { v: 'FECHA', l: 'Fecha' },
  { v: 'OPCION', l: 'Lista de opciones' }, { v: 'SI_NO', l: 'Sí / No' }, { v: 'COLABORADOR', l: 'Colaborador' },
]
const VINCULOS = [
  { v: 'GLOBAL', l: 'General (registros sueltos)' }, { v: 'POR_COLABORADOR', l: 'Por colaborador' }, { v: 'POR_SEDE', l: 'Por sede' },
]

/** Lápiz (editar el módulo), campos (editar o borrar cada uno) y papelera, al lado de cada módulo. */
export function ModuloAcciones({ modulo, puedeEliminar }: { modulo: ModuloItem; puedeEliminar: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState(false)
  const [borrando, setBorrando] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Pista texto="Editar el módulo">
        <Button size="icon" variant="ghost" onClick={() => setEditando(true)} aria-label={`Editar ${modulo.nombre}`}><Pencil className="size-4" /></Button>
      </Pista>
      <Pista texto="Campos">
        <Button size="icon" variant="ghost" onClick={() => setCampos(true)} aria-label={`Campos de ${modulo.nombre}`}><ListChecks className="size-4" /></Button>
      </Pista>
      {puedeEliminar && (
        <BotonEliminar
          onEliminar={() => setBorrando(true)} etiqueta={`Eliminar ${modulo.nombre}`}
          motivoBloqueo={modulo.registros > 0 ? `No se puede eliminar: el módulo tiene ${modulo.registros} registro(s). Bórralos primero desde el módulo.` : null}
        />
      )}

      {editando && <DialogEditarModulo modulo={modulo} onClose={() => setEditando(false)} onDone={() => { setEditando(false); router.refresh() }} />}
      {campos && <DialogCampos modulo={modulo} puedeEliminar={puedeEliminar} onClose={() => setCampos(false)} />}
      {borrando && (
        <DialogMotivo
          titulo="Eliminar módulo"
          resumen={`${modulo.nombre} · ${modulo.campos.length} campo(s). Desaparece del menú; no se puede deshacer.`}
          placeholder="¿Por qué se elimina?"
          onClose={() => setBorrando(false)}
          onConfirmar={async (motivo) => {
            const res = await eliminarModulo({ id: modulo.id, motivo })
            if (res.ok) { toast.success('Módulo eliminado.'); router.refresh(); return true }
            toast.error(res.error, { duration: 8000 })
            return false
          }}
        />
      )}
    </div>
  )
}

function DialogEditarModulo({ modulo, onClose, onDone }: { modulo: ModuloItem; onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState(modulo.nombre)
  const [descripcion, setDescripcion] = useState(modulo.descripcion ?? '')
  const [icono, setIcono] = useState(modulo.icono)
  const [seccion, setSeccion] = useState(modulo.seccion)
  const [vinculo, setVinculo] = useState<ModuloItem['vinculo']>(modulo.vinculo)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await editarModulo({ id: modulo.id, nombre, descripcion: descripcion.trim() || undefined, icono, seccion, vinculo })
    setG(false)
    if (res.ok) { toast.success('Módulo actualizado.'); onDone() } else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar módulo</DialogTitle>
          <DialogDescription>El enlace y los permisos (/modulos/{modulo.slug}) no cambian.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se registra aquí" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ícono <span className="text-destructive">*</span></Label>
              <Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="Layers" />
            </div>
            <div className="space-y-1.5">
              <Label>Sección <span className="text-destructive">*</span></Label>
              <Input value={seccion} onChange={(e) => setSeccion(e.target.value)} placeholder="Personalizados" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vínculo <span className="text-destructive">*</span></Label>
            <Select value={vinculo} onValueChange={(v) => setVinculo(v as ModuloItem['vinculo'])} disabled={modulo.registros > 0}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{VINCULOS.map((v) => <SelectItem key={v.v} value={v.v}>{v.l}</SelectItem>)}</SelectContent>
            </Select>
            {modulo.registros > 0 && <p className="text-xs text-muted-foreground">Con registros el vínculo ya no se cambia.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || nombre.trim().length < 2 || !icono.trim() || !seccion.trim()}>{g ? <Spinner /> : <Save className="size-4" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Los campos del módulo, cada uno con su lápiz y su papelera (bloqueada si ya tiene valores). */
function DialogCampos({ modulo, puedeEliminar, onClose }: { modulo: ModuloItem; puedeEliminar: boolean; onClose: () => void }) {
  const router = useRouter()
  const [editando, setEditando] = useState<CampoItem | null>(null)
  const [borrando, setBorrando] = useState<CampoItem | null>(null)
  const unico = modulo.campos.length <= 1

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campos · {modulo.nombre}</DialogTitle>
          <DialogDescription>Un campo con valores guardados no se borra ni cambia de tipo.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {modulo.campos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.etiqueta}{c.requerido && <span className="text-destructive"> *</span>}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {TIPOS.find((t) => t.v === c.tipo)?.l ?? c.tipo}{c.generaAlerta ? ' · con alerta' : ''}{!c.mostrarEnTabla ? ' · oculto en la tabla' : ''}{c.conValor > 0 ? ` · ${c.conValor} con valor` : ''}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(c)} aria-label={`Editar ${c.etiqueta}`} title="Editar"><Pencil className="size-4" /></Button>
              {puedeEliminar && (
                <BotonEliminar
                  onEliminar={() => setBorrando(c)} etiqueta={`Eliminar ${c.etiqueta}`}
                  motivoBloqueo={unico
                    ? 'Es el único campo del módulo: agrega otro antes de borrarlo, o elimina el módulo.'
                    : c.conValor > 0 ? `No se puede eliminar: ${c.conValor} registro(s) tienen valor en «${c.etiqueta}». Vacíalo en esos registros primero.` : null}
                />
              )}
            </li>
          ))}
        </ul>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cerrar</Button></DialogFooter>
      </DialogContent>

      {editando && <DialogEditarCampo campo={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh() }} />}
      {borrando && (
        <DialogMotivo
          titulo="Eliminar campo"
          resumen={`«${borrando.etiqueta}» de ${modulo.nombre}. No se puede deshacer.`}
          placeholder="¿Por qué se elimina?"
          onClose={() => setBorrando(null)}
          onConfirmar={async (motivo) => {
            const res = await eliminarCampo({ id: borrando.id, motivo })
            if (res.ok) { toast.success('Campo eliminado.'); router.refresh(); return true }
            toast.error(res.error, { duration: 8000 })
            return false
          }}
        />
      )}
    </Dialog>
  )
}

function DialogEditarCampo({ campo, onClose, onDone }: { campo: CampoItem; onClose: () => void; onDone: () => void }) {
  const [etiqueta, setEtiqueta] = useState(campo.etiqueta)
  const [tipo, setTipo] = useState(campo.tipo)
  const [requerido, setRequerido] = useState(campo.requerido)
  const [opciones, setOpciones] = useState(campo.opciones ?? '')
  const [generaAlerta, setGeneraAlerta] = useState(campo.generaAlerta)
  const [mostrarEnTabla, setMostrarEnTabla] = useState(campo.mostrarEnTabla)
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await editarCampo({ id: campo.id, etiqueta, tipo: tipo as 'TEXTO', requerido, opciones: opciones || undefined, generaAlerta, mostrarEnTabla })
    setG(false)
    if (res.ok) { toast.success('Campo actualizado.'); onDone() } else toast.error(res.error, { duration: 8000 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !g && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar campo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre del campo <span className="text-destructive">*</span></Label>
            <Input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo <span className="text-destructive">*</span></Label>
            <Select value={tipo} onValueChange={setTipo} disabled={campo.conValor > 0}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
            {campo.conValor > 0 && <p className="text-xs text-muted-foreground">{campo.conValor} registro(s) ya tienen valor: el tipo no se cambia.</p>}
          </div>
          {tipo === 'OPCION' && (
            <div className="space-y-1.5">
              <Label>Opciones <span className="text-destructive">*</span></Label>
              <Input value={opciones} onChange={(e) => setOpciones(e.target.value)} placeholder="Separadas por coma" />
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={requerido} onCheckedChange={(v) => setRequerido(Boolean(v))} /> Requerido</label>
            <label className="flex items-center gap-2"><Checkbox checked={mostrarEnTabla} onCheckedChange={(v) => setMostrarEnTabla(Boolean(v))} /> Mostrar en la tabla</label>
            {tipo === 'FECHA' && <label className="flex items-center gap-2"><Checkbox checked={generaAlerta} onCheckedChange={(v) => setGeneraAlerta(Boolean(v))} /> Generar alerta de vencimiento</label>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !etiqueta.trim() || (tipo === 'OPCION' && !opciones.trim())}>{g ? <Spinner /> : <Save className="size-4" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

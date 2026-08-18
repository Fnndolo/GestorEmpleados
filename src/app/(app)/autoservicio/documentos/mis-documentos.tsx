'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CloudUpload, Download, Eye, FileText, Image as ImageIcon, MoreVertical, Paperclip, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { borrarMiDocumento, editarMiDocumento } from '../documentos-acciones'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type DocItem = {
  id: string; nombre: string; tipo: string | null; categoria: string; fecha: string
  vence: string | null; esImagen: boolean
  /** true solo si lo subió el propio colaborador: puede corregirlo o borrarlo. */
  editable: boolean
  tipoId: string | null; descripcion: string | null; venceIso: string | null
}

/** Orden fijo de las categorías; solo se muestran las que tienen documentos. */
const CATEGORIAS = ['Expediente', 'Contratos', 'Desprendibles', 'Certificaciones', 'Actas', 'Otros']
type TipoDoc = { id: string; nombre: string; requiereVencimiento: boolean }

export function MisDocumentos({ colaboradorId, documentos, tipos, faltantes }: {
  colaboradorId: string
  documentos: DocItem[]
  tipos: TipoDoc[]
  faltantes: string[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [imagen, setImagen] = useState<DocItem | null>(null)
  const [filtro, setFiltro] = useState<string>('Todos')
  const [editando, setEditando] = useState<DocItem | null>(null)
  const [borrando, setBorrando] = useState<DocItem | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function borrar() {
    if (!borrando) return
    setOcupado(true)
    const res = await borrarMiDocumento({ id: borrando.id })
    setOcupado(false)
    if (res.ok) { toast.success('Documento eliminado.'); setBorrando(null); router.refresh() }
    else toast.error(res.error)
  }

  const categorias = CATEGORIAS.filter((c) => documentos.some((d) => d.categoria === c))
  const visibles = filtro === 'Todos' ? documentos : documentos.filter((d) => d.categoria === filtro)

  return (
    <div className="space-y-4">
      {faltantes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-[13px] font-medium">Documentos pendientes por entregar</p>
            <p className="mt-0.5 text-muted-foreground">{faltantes.join(' · ')}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {categorias.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {['Todos', ...categorias].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFiltro(c)}
                className={
                  filtro === c
                    ? 'rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background'
                    : 'rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent'
                }
              >
                {c}
                <span className="ml-1 tabular-nums opacity-60">
                  {c === 'Todos' ? documentos.length : documentos.filter((d) => d.categoria === c).length}
                </span>
              </button>
            ))}
          </div>
        ) : <span />}
        <Button onClick={() => setAbierto(true)}><CloudUpload className="size-4" /> Subir documento</Button>
      </div>

      {visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {filtro === 'Todos' ? 'Aún no tienes documentos en tu expediente.' : `No tienes documentos en "${filtro}".`}
        </CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {visibles.map((d) => {
            const info = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/8 text-foreground">
                  {d.esImagen ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{d.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.tipo ? `${d.tipo} · ` : ''}{d.fecha}{d.vence ? ` · vence ${d.vence}` : ''}
                  </span>
                </span>
                <Eye className="size-4 shrink-0 text-muted-foreground" />
              </>
            )
            const clases = 'flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
            // El documento se abre DENTRO de la app: PDF con el visor embebido
            // (pdf.js en móvil) e imagen en un diálogo de ampliación.
            const abrir = d.esImagen ? (
              <button type="button" onClick={() => setImagen(d)} className={clases}>{info}</button>
            ) : (
              <VisorPdf documentoId={d.id} titulo={d.nombre} className={clases}>{info}</VisorPdf>
            )
            return (
              <div key={d.id} className="flex items-center pr-1.5">
                {abrir}
                {/* Solo lo que subió el propio colaborador se puede corregir o borrar. */}
                {d.editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground" aria-label="Acciones del documento">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditando(d)}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setBorrando(d)}><Trash2 className="size-4" /> Eliminar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          })}
        </CardContent></Card>
      )}

      {/* Ampliación de imágenes sin salir de la app, con opción de descargar. */}
      <Dialog open={imagen !== null} onOpenChange={(o) => { if (!o) setImagen(null) }}>
        <DialogContent className="max-w-[calc(100%-2.5rem)] sm:max-w-2xl">
          <DialogHeader className="flex-row items-center gap-1 space-y-0 pr-8">
            <DialogTitle className="min-w-0 flex-1 truncate text-base">{imagen?.nombre}</DialogTitle>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Descargar">
              <a href={`/api/documentos/${imagen?.id}?descargar=1`}><Download className="size-4" /></a>
            </Button>
          </DialogHeader>
          {imagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documentos/${imagen.id}`} alt={imagen.nombre} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {editando && (
        <DialogEditar
          doc={editando}
          colaboradorId={colaboradorId}
          tipos={tipos}
          onClose={() => setEditando(null)}
          onDone={() => { setEditando(null); router.refresh() }}
        />
      )}

      <AlertDialog open={borrando !== null} onOpenChange={(o) => { if (!o && !ocupado) setBorrando(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará «{borrando?.nombre}» de tu expediente. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado} onClick={(e) => { e.preventDefault(); borrar() }}>
              {ocupado && <Spinner />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {abierto && (
        <DialogSubir
          colaboradorId={colaboradorId}
          tipos={tipos}
          onClose={() => setAbierto(false)}
          onDone={() => { setAbierto(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function DialogSubir({ colaboradorId, tipos, onClose, onDone }: {
  colaboradorId: string; tipos: TipoDoc[]; onClose: () => void; onDone: () => void
}) {
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [tipoId, setTipoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  const tipo = tipos.find((t) => t.id === tipoId) ?? null

  async function subir() {
    if (!archivo) { toast.error('Selecciona el archivo (imagen o PDF).'); return }
    if (tipo?.requiereVencimiento && !vencimiento) { toast.error(`${tipo.nombre} requiere la fecha de vencimiento.`); return }
    setG(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      fd.append('entidadTipo', 'Colaborador')
      fd.append('entidadId', colaboradorId)
      fd.append('nombre', nombre.trim() || tipo?.nombre || archivo.name)
      if (tipoId) fd.append('tipoDocumentoId', tipoId)
      if (descripcion.trim()) fd.append('descripcion', descripcion.trim())
      if (vencimiento) fd.append('fechaVencimiento', vencimiento)
      const res = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'No se pudo subir el documento.' }))
        toast.error(error ?? 'No se pudo subir el documento.')
        setG(false)
        return
      }
      toast.success('Documento subido. Talento Humano lo revisará.')
      setG(false)
      onDone()
    } catch {
      setG(false)
      toast.error('No se pudo subir el documento.')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir documento a mi expediente</DialogTitle>
          <DialogDescription>Cédula, diplomas, certificados, RUT… Queda en tu hoja de vida y Talento Humano lo revisa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de documento (opcional)</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona si aplica…" /></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre {tipo ? '(opcional: usa el del tipo)' : ''}</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo?.nombre ?? 'Ej: Diploma de bachiller'} />
          </div>
          {tipo?.requiereVencimiento && (
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
              <p className="text-xs text-muted-foreground">Este tipo de documento vence; el sistema te avisará antes de la fecha.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Archivo (imagen o PDF)</Label>
            <input ref={inputArchivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
              <Paperclip className="size-4" /> {archivo ? archivo.name : 'Seleccionar archivo'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={subir} disabled={g}>{g && <Spinner />} Subir documento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Corrección de un documento que el propio colaborador subió: cambia los datos y,
 * si se equivocó de archivo, permite reemplazarlo (sube el nuevo y borra el viejo).
 */
function DialogEditar({ doc, colaboradorId, tipos, onClose, onDone }: {
  doc: DocItem; colaboradorId: string; tipos: TipoDoc[]; onClose: () => void; onDone: () => void
}) {
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [tipoId, setTipoId] = useState(doc.tipoId ?? '')
  const [nombre, setNombre] = useState(doc.nombre)
  const [descripcion, setDescripcion] = useState(doc.descripcion ?? '')
  const [vencimiento, setVencimiento] = useState(doc.venceIso ?? '')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  const tipo = tipos.find((t) => t.id === tipoId) ?? null

  async function guardar() {
    if (!nombre.trim()) { toast.error('Escribe un nombre para el documento.'); return }
    if (tipo?.requiereVencimiento && !vencimiento) { toast.error(`${tipo.nombre} requiere la fecha de vencimiento.`); return }
    setG(true)

    // Reemplazo del archivo: se sube el nuevo con los datos ya corregidos y se
    // borra el anterior, para que no queden dos versiones en el expediente.
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'Colaborador')
        fd.append('entidadId', colaboradorId)
        fd.append('nombre', nombre.trim())
        if (tipoId) fd.append('tipoDocumentoId', tipoId)
        if (descripcion.trim()) fd.append('descripcion', descripcion.trim())
        if (vencimiento) fd.append('fechaVencimiento', vencimiento)
        const res = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: null }))
          toast.error(error ?? 'No se pudo subir el archivo nuevo.')
          setG(false); return
        }
      } catch {
        toast.error('No se pudo subir el archivo nuevo.'); setG(false); return
      }
      const borrado = await borrarMiDocumento({ id: doc.id })
      setG(false)
      if (!borrado.ok) { toast.error(borrado.error); return }
      toast.success('Documento reemplazado.')
      onDone()
      return
    }

    const res = await editarMiDocumento({
      id: doc.id,
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      tipoDocumentoId: tipoId,
      fechaVencimiento: vencimiento,
    })
    setG(false)
    if (res.ok) { toast.success('Documento actualizado.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>
          <DialogDescription>Corrige los datos o reemplaza el archivo si subiste el equivocado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de documento (opcional)</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona si aplica…" /></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          {tipo?.requiereVencimiento && (
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reemplazar archivo (opcional)</Label>
            <input ref={inputArchivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
              <Paperclip className="size-4" /> {archivo ? archivo.name : 'Mantener el archivo actual'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={g} onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g && <Spinner />} Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

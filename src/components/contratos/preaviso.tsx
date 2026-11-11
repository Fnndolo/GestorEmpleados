'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BellRing, Download, FileUp, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MAX_PDF_BYTES, mensajePdfPesado, subirPdfTemporal } from '@/lib/archivos'
import { FilaDocumento, VerDocumento } from '@/components/contratos/fila-documento'
import { enviarPreavisoContrato, eliminarPreavisoContrato, editarPreavisoContrato } from '@/app/(app)/contratos/preaviso-acciones'
import { subirMiPreavisoFirmado } from '@/app/(app)/autoservicio/preaviso-acciones'
import { enviarDocumentoFirmaTerminacion } from '@/app/(app)/terminaciones/acciones'

export type PreavisoItem = {
  id: string
  nombre: string
  mensaje: string | null
  documentoId: string
  respuestaDocId: string | null
  enviado: string
  respondido: string | null
}

/** Valida que sea un PDF de tamaño admitido; avisa y devuelve false si no. */
function pdfValido(archivo: File): boolean {
  if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) { toast.error('Sube el documento en PDF.'); return false }
  if (archivo.size > MAX_PDF_BYTES) { toast.error(mensajePdfPesado(archivo.size)); return false }
  return true
}

/** Contratos → Acciones → Enviar preaviso; con `editar`, corregir uno ya enviado. */
export function DialogPreaviso({ contratoId, terminacionId, editar, onClose, onDone }: {
  contratoId?: string; terminacionId?: string; editar?: PreavisoItem; onClose: () => void; onDone: () => void
}) {
  const [nombre, setNombre] = useState(editar?.nombre ?? (terminacionId ? 'Carta de terminación' : 'Preaviso'))
  const [mensaje, setMensaje] = useState(editar?.mensaje ?? '')
  const [pdfRef, setPdfRef] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [g, setG] = useState(false)

  async function elegir(archivo: File | undefined) {
    setPdfRef(null)
    if (!archivo || !pdfValido(archivo)) return
    setSubiendo(true)
    try { setPdfRef(await subirPdfTemporal(archivo)) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo subir el PDF.') }
    finally { setSubiendo(false) }
  }

  async function enviar() {
    if (!editar && !pdfRef) return
    setG(true)
    const res = editar
      ? await editarPreavisoContrato({ id: editar.id, nombre: nombre.trim(), mensaje: mensaje.trim(), pdfRef })
      : terminacionId
      ? await enviarDocumentoFirmaTerminacion({ terminacionId, nombre: nombre.trim(), mensaje: mensaje.trim(), pdfRef: pdfRef! })
      : await enviarPreavisoContrato({ contratoId: contratoId!, nombre: nombre.trim(), mensaje: mensaje.trim(), pdfRef: pdfRef! })
    setG(false)
    if (res.ok) { toast.success(editar ? 'Documento actualizado.' : 'Enviado al autoservicio de la persona.'); onDone() } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !g) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editar ? 'Editar documento' : terminacionId ? 'Enviar documento para firmar' : 'Enviar preaviso'}</DialogTitle>
          <DialogDescription>La persona lo descarga en su autoservicio, lo firma o lo llena por fuera y vuelve a subir el PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="preaviso-nombre">Nombre del documento <span className="text-destructive">*</span></Label>
            <Input id="preaviso-nombre" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preaviso-pdf">{editar ? 'Cambiar el PDF' : <>Documento en PDF <span className="text-destructive">*</span></>}</Label>
            <Input id="preaviso-pdf" type="file" accept="application/pdf,.pdf" disabled={subiendo || g} onChange={(e) => elegir(e.target.files?.[0])} />
            {subiendo && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Spinner /> Subiendo…</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preaviso-mensaje">Mensaje para la persona</Label>
            <Textarea id="preaviso-mensaje" value={mensaje} maxLength={500} rows={3} placeholder="Ej.: Fírmalo y súbelo antes del viernes." onChange={(e) => setMensaje(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={g}>Cancelar</Button>
          <Button onClick={enviar} disabled={g || subiendo || (!editar && !pdfRef) || nombre.trim().length < 3}>{g && <Spinner />}{editar ? 'Guardar' : 'Enviar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Botón de la terminación: enviar a la persona un documento para que lo firme. */
export function EnviarParaFirmar({ terminacionId }: { terminacionId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><BellRing className="size-4" /> Enviar documento para firmar</Button>
      {abierto && <DialogPreaviso terminacionId={terminacionId} onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />}
    </>
  )
}

/** El preaviso en la lista de documentos del contrato (vista de Talento Humano). */
export function FilaPreaviso({ p, puedeEditar }: { p: PreavisoItem; puedeEditar: boolean }) {
  const router = useRouter()
  const [borrar, setBorrar] = useState(false)
  const [editando, setEditando] = useState(false)

  async function eliminar() {
    const res = await eliminarPreavisoContrato({ id: p.id })
    setBorrar(false)
    if (res.ok) { toast.success('Preaviso eliminado.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <>
      <FilaDocumento
        icono={BellRing} titulo={p.nombre} tono={p.respondido ? 'ok' : 'pendiente'}
        sub={p.respondido ? `Enviado el ${p.enviado} · devuelto firmado el ${p.respondido}` : `Enviado el ${p.enviado} · esperando el PDF firmado`}
      >
        <VerDocumento documentoId={p.respuestaDocId ?? p.documentoId} titulo={p.nombre} />
        {p.respuestaDocId && <VerDocumento documentoId={p.documentoId} titulo={`${p.nombre} (enviado)`} />}
        {puedeEditar && (
          <>
            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setEditando(true)} aria-label={`Editar ${p.nombre}`}>
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setBorrar(true)} aria-label={`Eliminar ${p.nombre}`}>
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </FilaDocumento>
      {editando && <DialogPreaviso editar={p} onClose={() => setEditando(false)} onDone={() => { setEditando(false); router.refresh() }} />}
      <AlertDialog open={borrar} onOpenChange={setBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{p.nombre}»</AlertDialogTitle>
            <AlertDialogDescription>Se borran el documento enviado{p.respuestaDocId ? ' y el PDF que devolvió la persona' : ''}. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** El preaviso en el autoservicio: descargarlo y devolverlo firmado. */
export function MiPreaviso({ p }: { p: PreavisoItem }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [g, setG] = useState(false)

  async function elegir(archivo: File | undefined) {
    if (!archivo || !pdfValido(archivo)) return
    setG(true)
    try {
      const res = await subirMiPreavisoFirmado({ preavisoId: p.id, pdfRef: await subirPdfTemporal(archivo) })
      if (res.ok) { toast.success('Listo, Talento Humano ya tiene tu documento.'); router.refresh() } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el PDF.')
    } finally {
      setG(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{p.nombre}</span>
        <span className={p.respondido ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-amber-600 dark:text-amber-400'}>
          {p.respondido ? `Entregado el ${p.respondido}` : 'Pendiente por devolver'}
        </span>
      </div>
      {p.mensaje && <p className="text-xs text-muted-foreground">{p.mensaje}</p>}
      {!p.respondido && <p className="text-xs text-muted-foreground">Descárgalo, fírmalo o llénalo, y súbelo aquí en PDF.</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={`/api/documentos/${p.documentoId}?descargar=1`}><Download className="size-4" /> Descargar</a>
        </Button>
        {p.respuestaDocId && <VerDocumento documentoId={p.respuestaDocId} titulo={`${p.nombre} (firmado)`} />}
        <Button size="sm" onClick={() => input.current?.click()} disabled={g}>
          {g ? <Spinner /> : <FileUp className="size-4" />} {p.respondido ? 'Reemplazar PDF' : 'Subir firmado'}
        </Button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
      </div>
    </div>
  )
}

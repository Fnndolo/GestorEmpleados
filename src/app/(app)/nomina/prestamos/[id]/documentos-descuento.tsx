'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, CircleCheck, Clock, FilePlus2, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { agregarDocumentoDescuento, quitarDocumentoDescuento } from '../../acciones'
import { CampoAcuerdo, ACUERDO_VACIO, type EstadoAcuerdo } from '../campo-acuerdo'

export type DocumentoDescuentoItem = {
  id: string
  nombre: string
  /** El firmado si ya existe; si no, el que se subió. */
  verId: string
  requiereFirma: boolean
  fechaFirma: string | null
}

/**
 * Otros documentos del descuento, aparte del acuerdo de pago (otrosíes,
 * compromisos, soportes). Se pueden subir varios; cada uno va ya firmado o
 * para que el colaborador lo firme en su autoservicio.
 */
export function DocumentosDescuento({ prestamoId, documentos, puedeEditar }: {
  prestamoId: string
  documentos: DocumentoDescuentoItem[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [pdf, setPdf] = useState<EstadoAcuerdo>(ACUERDO_VACIO)
  const [g, setG] = useState(false)
  const [quitando, setQuitando] = useState<string | null>(null)

  function cerrar() { setAbierto(false); setNombre(''); setPdf(ACUERDO_VACIO) }

  async function guardar() {
    if (!pdf.ref) return
    if (nombre.trim().length < 3) { toast.error('Escribe el nombre del documento.'); return }
    setG(true)
    try {
      const res = await agregarDocumentoDescuento({
        prestamoId, nombre: nombre.trim(), pdfRef: pdf.ref, requiereFirma: pdf.requiereFirma === true,
        posicionFirma: pdf.requiereFirma ? pdf.posicion : null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(pdf.requiereFirma ? 'Documento enviado al autoservicio del colaborador para que lo firme.' : 'Documento guardado.')
      cerrar(); router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el documento.')
    } finally {
      setG(false)
    }
  }

  async function quitar(id: string) {
    setQuitando(id)
    const res = await quitarDocumentoDescuento({ id })
    setQuitando(null)
    if (res.ok) { toast.success('Documento quitado.'); router.refresh() } else toast.error(res.error)
  }

  if (!puedeEditar && documentos.length === 0) return null
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Otros documentos</span>
        {documentos.length === 0 && <span className="text-sm text-muted-foreground">Ninguno</span>}
        <span className="flex-1" />
        {puedeEditar && (
          <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><FilePlus2 className="size-4" /> Agregar documento</Button>
        )}
      </div>
      {documentos.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm">{d.nombre}</span>
          {d.fechaFirma ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CircleCheck className="size-4" /> Firmado el {d.fechaFirma}</span>
          ) : d.requiereFirma ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="size-4" /> Esperando la firma del colaborador</span>
          ) : (
            <span className="text-xs text-muted-foreground">Firmado en físico</span>
          )}
          <span className="flex-1" />
          <VisorPdf documentoId={d.verId} titulo={d.nombre} mimeType="application/pdf" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
            <FileText className="size-3.5" /> Ver
          </VisorPdf>
          {puedeEditar && !d.fechaFirma && (
            <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" aria-label={`Quitar ${d.nombre}`} title="Quitar el documento"
              disabled={quitando === d.id} onClick={() => quitar(d.id)}>
              {quitando === d.id ? <Spinner /> : <Trash2 className="size-4" />}
            </Button>
          )}
        </div>
      ))}
      <Dialog open={abierto} onOpenChange={(o) => { if (!g && !o) cerrar() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Agregar documento al descuento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-desc-nombre">Nombre del documento <span className="text-destructive">*</span></Label>
              <Input id="doc-desc-nombre" value={nombre} maxLength={120} placeholder="Ej.: Otrosí 1" onChange={(e) => setNombre(e.target.value)} />
            </div>
            <CampoAcuerdo valor={pdf} onCambio={setPdf} etiqueta="Documento en PDF" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || pdf.subiendo || !pdf.ref || nombre.trim().length < 3}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

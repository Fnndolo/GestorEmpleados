'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MAX_PDF_BYTES, mensajePdfPesado, subirPdfTemporal } from '@/lib/archivos'
import { FileCog, Paperclip, Sparkles, Upload } from 'lucide-react'
import { adjuntarDocumentoGenerado } from '@/app/(app)/documentos-adjuntos-acciones'
import { regenerarDocumento, type DestinoGenerable } from '@/app/(app)/documentos-regenerar-acciones'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export type DestinoAdjunto =
  | 'certificacion' | 'desprendible' | 'cuentaCobro'
  | 'actaEntregaActivo' | 'actaDevolucionActivo' | 'recibidoDotacion' | 'soporteEpp'
  | 'prorroga' | 'otrosi'

/** Destinos que el sistema sabe armar desde su plantilla. */
const GENERABLES = new Set<string>([
  'desprendible', 'cuentaCobro', 'actaEntregaActivo', 'actaDevolucionActivo',
  'recibidoDotacion', 'soporteEpp',
])

/**
 * Las DOS formas de tener el documento, en el mismo sitio: dejar que el sistema
 * lo arme desde la plantilla, o subir uno propio.
 *
 * No es una preferencia estética. Quien confía en la plantilla la usa y no
 * piensa más; quien tiene un caso que la plantilla no contempla —una cláusula
 * distinta, un documento ya firmado en papel— no queda bloqueado esperando a
 * que se programe la excepción. Y se puede ir y volver entre las dos.
 *
 * Donde el sistema no sabe generar —prórrogas, otrosíes— se ofrece solo la
 * subida, y se dice por qué.
 */
export function AdjuntarDocumento({
  destino, id, etiqueta = 'Documento', tieneDocumento = false, variante = 'default', tamano = 'sm', className,
}: {
  destino: DestinoAdjunto
  /** Id del registro (la liquidación, el otrosí, el acta…). */
  id: string
  etiqueta?: string
  /** Si ya hay documento, los textos hablan de reemplazarlo. */
  tieneDocumento?: boolean
  variante?: 'default' | 'outline' | 'ghost' | 'secondary'
  tamano?: 'sm' | 'icon'
  className?: string
}) {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState<'generar' | 'subir' | null>(null)

  const sePuedeGenerar = GENERABLES.has(destino)

  function cerrar() {
    setAbierto(false)
    setArchivo(null)
  }

  async function generar() {
    setOcupado('generar')
    const res = await regenerarDocumento({ destino: destino as DestinoGenerable, id })
    setOcupado(null)
    if (res.ok) {
      toast.success('Documento generado desde la plantilla del sistema.')
      cerrar()
      router.refresh()
    } else toast.error(res.error)
  }

  async function subir() {
    if (!archivo) { toast.error('Selecciona el PDF que quieres subir.'); return }
    if (archivo.size > MAX_PDF_BYTES) { toast.error(mensajePdfPesado(archivo.size)); return }
    setOcupado('subir')
    let pdfRef: string
    try {
      pdfRef = await subirPdfTemporal(archivo)
    } catch (e) {
      setOcupado(null); toast.error(e instanceof Error ? e.message : 'No se pudo subir el PDF.'); return
    }
    const res = await adjuntarDocumentoGenerado({ destino, id, pdfRef, nombre: archivo.name })
    setOcupado(null)
    if (res.ok) {
      toast.success(tieneDocumento ? 'Documento reemplazado por el que subiste.' : 'Documento adjuntado.')
      cerrar()
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button
        type="button"
        size={tamano}
        variant={variante}
        className={className}
        onClick={() => setAbierto(true)}
        aria-label={tamano === 'icon' ? etiqueta : undefined}
        title={tamano === 'icon' ? etiqueta : undefined}
      >
        <FileCog className="size-4" />
        {tamano !== 'icon' && etiqueta}
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => { if (!ocupado) { setAbierto(o); if (!o) setArchivo(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tieneDocumento ? 'Rehacer el documento' : 'Crear el documento'}</DialogTitle>
            <DialogDescription>
              {sePuedeGenerar
                ? 'Elige cómo quieres tenerlo: armado por el sistema o el tuyo propio.'
                : 'Este documento no se arma desde plantilla: se redacta fuera, se firma y se adjunta aquí.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Opción 1 — la plantilla del sistema */}
            {sePuedeGenerar && (
              <div className="rounded-xl border p-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Generarlo con el sistema</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Se arma desde la plantilla con los datos ya registrados. Es lo habitual.
                    </p>
                  </div>
                </div>
                <Button className="mt-3 w-full" size="sm" onClick={generar} disabled={ocupado !== null}>
                  {ocupado === 'generar' ? <Spinner /> : <Sparkles className="size-4" />}
                  {tieneDocumento ? 'Volver a generarlo' : 'Generar'}
                </Button>
              </div>
            )}

            {/* Opción 2 — el PDF propio */}
            <div className={cn('rounded-xl border p-3.5', !sePuedeGenerar && 'border-dashed')}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/8 text-foreground">
                  <Upload className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Subir mi propio PDF</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Para cuando el documento ya está hecho o necesita un texto que la plantilla no contempla.
                  </p>
                </div>
              </div>

              <input
                ref={inputArchivo}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button" size="sm"
                className="mt-3 w-full justify-start"
                onClick={() => inputArchivo.current?.click()}
                disabled={ocupado !== null}
              >
                <Paperclip className="size-4" />
                <span className="truncate">{archivo ? archivo.name : 'Seleccionar archivo'}</span>
              </Button>
              {archivo && (
                <p className="mt-1 text-xs text-muted-foreground">{(archivo.size / 1024).toFixed(0)} KB</p>
              )}
              <Button
                className="mt-2 w-full" size="sm"
                variant={sePuedeGenerar ? 'outline' : 'default'}
                onClick={subir}
                disabled={ocupado !== null || !archivo}
              >
                {ocupado === 'subir' ? <Spinner /> : <Upload className="size-4" />}
                {tieneDocumento ? 'Reemplazar por el mío' : 'Usar el mío'}
              </Button>
            </div>

            {tieneDocumento && (
              <p className="text-xs text-muted-foreground">
                Cualquiera de las dos reemplaza al documento actual, que se elimina.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={ocupado !== null} onClick={cerrar}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

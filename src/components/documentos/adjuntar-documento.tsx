'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileCog, Paperclip, Sparkles, Upload } from 'lucide-react'
import { adjuntarDocumentoGenerado } from '@/app/(app)/documentos-adjuntos-acciones'
import { regenerarDocumento, type DestinoGenerable } from '@/app/(app)/documentos-regenerar-acciones'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/** 3 MB de PDF ≈ 4 MB en base64, el tope del cuerpo de la Server Action. */
const MAX_PDF_BYTES = 3 * 1024 * 1024

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
  destino, id, etiqueta = 'Documento', tieneDocumento = false, plantillas, variante = 'outline', tamano = 'sm', className,
}: {
  destino: DestinoAdjunto
  /** Id del registro (la liquidación, el otrosí, el acta…). */
  id: string
  etiqueta?: string
  /** Si ya hay documento, los textos hablan de reemplazarlo. */
  tieneDocumento?: boolean
  /**
   * Plantillas disponibles para armarlo. Cuando el tipo de documento tiene
   * varias —como las cuentas de cobro—, se puede elegir; si no se elige, va la
   * de por defecto. Sin plantillas, no se muestra el selector.
   */
  plantillas?: { id: string; nombre: string }[]
  variante?: 'outline' | 'ghost' | 'secondary'
  tamano?: 'sm' | 'icon'
  className?: string
}) {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState<'generar' | 'subir' | null>(null)
  const [plantillaId, setPlantillaId] = useState('')

  const sePuedeGenerar = GENERABLES.has(destino)

  function cerrar() {
    setAbierto(false)
    setArchivo(null)
  }

  async function leerPdf(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('lectura'))
      reader.readAsDataURL(file)
    })
  }

  async function generar() {
    setOcupado('generar')
    const res = await regenerarDocumento({ destino: destino as DestinoGenerable, id, plantillaId: plantillaId || undefined })
    setOcupado(null)
    if (res.ok) {
      toast.success('Documento generado desde la plantilla del sistema.')
      cerrar()
      router.refresh()
    } else toast.error(res.error)
  }

  async function subir() {
    if (!archivo) { toast.error('Selecciona el PDF que quieres subir.'); return }
    if (archivo.size > MAX_PDF_BYTES) {
      toast.error(`El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 3 MB. Comprímelo o escanéalo a menor resolución.`)
      return
    }
    setOcupado('subir')
    let pdfBase64: string
    try {
      pdfBase64 = await leerPdf(archivo)
    } catch {
      setOcupado(null); toast.error('No se pudo leer el PDF.'); return
    }
    const res = await adjuntarDocumentoGenerado({ destino, id, pdfBase64, nombre: archivo.name })
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
                {plantillas && plantillas.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs">Plantilla (opcional)</Label>
                    <Select value={plantillaId} onValueChange={setPlantillaId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="La de por defecto" /></SelectTrigger>
                      <SelectContent>
                        {plantillas.map((pl) => <SelectItem key={pl.id} value={pl.id}>{pl.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                type="button" variant="outline" size="sm"
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

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Upload, FileText, Image as ImageIcon, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { cn } from '@/lib/utils'

export const inputArchivoCls =
  'block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground'

/** Sube un archivo asociado a una entidad (reutiliza el endpoint existente) y devuelve el id del Documento. */
export async function subirArchivoEntidad(entidadTipo: string, entidadId: string, file: File, nombre: string): Promise<string> {
  const fd = new FormData()
  fd.append('archivo', file, file.name)
  fd.append('entidadTipo', entidadTipo)
  fd.append('entidadId', entidadId)
  fd.append('nombre', nombre)
  const resp = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error ?? 'No se pudo subir el archivo')
  return json.id as string
}

/** Zona de selección de archivos con arrastrar-y-soltar y selección múltiple. */
export function ZonaArchivos({
  archivos, onChange, accept, multiple = true,
}: {
  archivos: File[]; onChange: (files: File[]) => void; accept?: string; multiple?: boolean
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function agregar(list: FileList | null) {
    if (!list || list.length === 0) return
    const nuevos = Array.from(list)
    onChange(multiple ? [...archivos, ...nuevos] : nuevos.slice(0, 1))
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); agregar(e.dataTransfer.files) }}
      className={cn(
        'flex h-40 w-full flex-col gap-2 overflow-hidden rounded-lg border-2 border-dashed p-2 transition-colors',
        drag ? 'border-primary bg-primary/5' : 'border-input',
      )}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full shrink-0 flex-col items-center gap-0.5 rounded-md py-2 text-center text-sm hover:bg-accent/40"
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-muted-foreground">{multiple ? 'Arrastra uno o varios archivos aquí o haz clic para elegirlos' : 'Arrastra el archivo aquí o haz clic para elegirlo'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => { agregar(e.target.files); e.target.value = '' }}
      />
      {archivos.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto border-t pt-2">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1 min-w-0">{f.name}</span>
              <span className="text-muted-foreground shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => onChange(archivos.filter((_, j) => j !== i))} className="text-destructive shrink-0" aria-label="Quitar"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export type SoporteDoc = { id: string; nombre: string; mimeType: string }

/** Lista de soportes SOLO LECTURA (con visor). Los soportes de cada etapa no se editan. */
export function SoportesLista({ documentos }: { documentos: SoporteDoc[] }) {
  if (documentos.length === 0) return null
  const imagenes = documentos.filter((d) => d.mimeType.startsWith('image/'))
  const archivos = documentos.filter((d) => !d.mimeType.startsWith('image/'))
  return (
    <div className="mt-1.5 space-y-1.5">
      {/* Las fotos van como miniaturas: una captura de pantalla a tamaño real
          se comía la pantalla del celular. Se amplían en el visor al tocarlas. */}
      {imagenes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {imagenes.map((d) => (
            <VisorPdf key={d.id} documentoId={d.id} titulo={d.nombre} mimeType={d.mimeType} className="overflow-hidden rounded-md border bg-muted/30 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/documentos/${d.id}`} alt={d.nombre} title={d.nombre} loading="lazy" className="h-16 w-20 object-cover" />
            </VisorPdf>
          ))}
        </div>
      )}
      {archivos.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-xs">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
          {/* Visor compartido: el iframe de antes quedaba en blanco en el celular. */}
          <VisorPdf documentoId={d.id} titulo={d.nombre} mimeType={d.mimeType} className="shrink-0 text-primary hover:underline">Ver</VisorPdf>
        </div>
      ))}
    </div>
  )
}

/** Lista + subida (multi + arrastrar) + visor de soportes de una entidad. */
export function SoportesEntidad({
  entidadTipo, entidadId, documentos, puedeEditar, titulo = 'Pruebas y soportes',
}: {
  entidadTipo: string; entidadId: string; documentos: SoporteDoc[]; puedeEditar: boolean; titulo?: string
}) {
  const router = useRouter()
  const [archivos, setArchivos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)

  async function subir() {
    if (archivos.length === 0) return
    setSubiendo(true)
    try {
      for (const file of archivos) await subirArchivoEntidad(entidadTipo, entidadId, file, file.name)
      toast.success(`${archivos.length} archivo(s) subido(s).`)
      setArchivos([])
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo subir.') } finally { setSubiendo(false) }
  }

  return (
    <Card className="mb-4"><CardContent className="py-4 space-y-3">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {documentos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin archivos.</p>
      ) : (
        <div className="space-y-1.5">
          {documentos.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              {d.mimeType.startsWith('image/') ? <ImageIcon className="size-4 text-muted-foreground shrink-0" /> : <FileText className="size-4 text-muted-foreground shrink-0" />}
              <span className="truncate flex-1 min-w-0">{d.nombre}</span>
              <VisorPdf documentoId={d.id} titulo={d.nombre} mimeType={d.mimeType} className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Eye className="size-4" /> Ver</VisorPdf>
            </div>
          ))}
        </div>
      )}
      {puedeEditar && (
        <div className="space-y-2 pt-1">
          <ZonaArchivos archivos={archivos} onChange={setArchivos} />
          {archivos.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" onClick={subir} disabled={subiendo}>{subiendo ? <Spinner /> : <Upload className="size-4" />} Subir {archivos.length} archivo(s)</Button>
            </div>
          )}
        </div>
      )}
    </CardContent></Card>
  )
}

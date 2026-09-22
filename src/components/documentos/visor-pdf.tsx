'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, ExternalLink, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Visor de PDF embebido: abre el documento en un diálogo dentro de la página,
 * con opción de ampliar, descargar o abrir en otra pestaña.
 *
 * En escritorio usa el visor nativo del navegador (iframe). En móvil los
 * navegadores NO renderizan PDF en iframes, así que se renderizan las páginas
 * con pdf.js sobre canvas (carga diferida; el worker vive en /pdf.worker.min.mjs).
 */
/**
 * Lo que el navegador puede mostrar dentro de la ventana: PDF, imágenes,
 * audio, video y texto. Un comprimido (el escaneo de un contrato viejo) no, y
 * ahí lo honesto es ofrecer la descarga en vez de dejar la ventana en blanco.
 */
const SE_PUEDE_VER = (tipo: string) =>
  tipo === 'application/pdf' ||
  tipo.startsWith('image/') ||
  tipo.startsWith('video/') ||
  tipo.startsWith('audio/') ||
  tipo.startsWith('text/')

export function VisorPdf({
  documentoId,
  url: urlPropia,
  archivo,
  titulo,
  className,
  children,
  mimeType,
  abierto: abiertoControlado,
  onAbiertoChange,
  pie,
}: {
  /** Documento guardado (se sirve por /api/documentos/:id). */
  documentoId?: string
  /**
   * O bien una URL cualquiera que devuelva el PDF: las muestras de Ajustes →
   * Plantillas de documentos no son documentos guardados.
   */
  url?: string
  /**
   * O bien un archivo que la persona acaba de elegir y todavía no ha subido:
   * poder mirarlo antes de enviarlo evita subir el PDF equivocado. Se sirve
   * desde el propio navegador (URL de objeto), que se libera al cerrar.
   */
  archivo?: Blob
  titulo: string
  className?: string
  /** Botón que abre el visor. Se omite cuando se controla `abierto` desde afuera (sin trigger propio). */
  children?: ReactNode
  /**
   * Tipo del archivo. Las listas de documentos mezclan PDF con fotos de cédulas,
   * soportes escaneados y algún comprimido: una imagen se muestra tal cual
   * (pdf.js no sabría abrirla) y lo que no se puede mostrar se ofrece descargar.
   * Si no se pasa, el visor lo averigua del propio documento al abrirlo.
   */
  mimeType?: string
  /**
   * Abrir sin botón propio: para vistas previas que arrancan solas apenas el
   * PDF está listo (p. ej. "Generar orden"). Sin esto, el visor maneja su
   * propio estado con el botón de `children`.
   */
  abierto?: boolean
  onAbiertoChange?: (v: boolean) => void
  /**
   * Contenido extra debajo del documento (p. ej. "Guardar"/"Cancelar" de una
   * vista previa que todavía no se archivó). El visor normal no lo necesita.
   */
  pie?: ReactNode
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false)
  const controlado = abiertoControlado !== undefined
  const abierto = controlado ? abiertoControlado : abiertoPropio
  const [amplio, setAmplio] = useState(false)
  // URL de objeto del archivo local: se crea al abrir y se libera al cerrar,
  // que es lo que dura la ventana. Un archivo distinto la vuelve a crear.
  const [urlArchivo, setUrlArchivo] = useState<string | null>(null)
  const url = archivo ? (urlArchivo ?? '') : (urlPropia ?? `/api/documentos/${documentoId ?? ''}`)
  // La URL de una muestra ya trae parámetros: el de descarga se suma, no se pisa.
  // Una URL de objeto no admite parámetros: ahí descarga el atributo `download`.
  const urlDescarga = archivo ? url : `${url}${url.includes('?') ? '&' : '?'}descargar=1`
  const nombreDescarga = archivo && 'name' in archivo ? (archivo as File).name : 'documento.pdf'
  // Pantalla táctil o angosta → el iframe no muestra PDFs: usar pdf.js.
  // Se evalúa al abrir (evento de usuario o efecto controlado), no antes.
  const [movil, setMovil] = useState(false)
  // Tipo averiguado del propio documento cuando quien abre el visor no lo sabe
  // (las listas que solo tienen el id). Una cabecera basta: no se baja el archivo.
  const [tipoDetectado, setTipoDetectado] = useState<string | null>(null)
  // Un archivo recién elegido (todavía sin subir) ya sabe lo que es.
  const tipoLocal = archivo && 'type' in archivo ? (archivo as File).type || null : null
  const tipo = mimeType ?? tipoLocal ?? tipoDetectado ?? undefined
  // Mientras no se sepa qué es, no se pinta nada: soltar un comprimido en el
  // iframe hace que el navegador se lo descargue solo, sin que nadie lo pida.
  const esperandoTipo = !tipo && !!documentoId && !archivo && !urlPropia
  const evaluarMovil = () => window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
  const detectarTipo = () => {
    if (mimeType || tipoDetectado || archivo || !documentoId) return
    fetch(`/api/documentos/${documentoId}`, { method: 'HEAD' })
      // Si la consulta falla, se sigue como PDF (lo que era antes): mejor
      // intentar mostrarlo que decir en falso que no se puede ver.
      .then((r) => setTipoDetectado((r.ok && r.headers.get('content-type')?.split(';')[0]) || 'application/pdf'))
      .catch(() => setTipoDetectado('application/pdf'))
  }
  const alAbrir = () => {
    setMovil(evaluarMovil())
    detectarTipo()
    if (archivo) setUrlArchivo(URL.createObjectURL(archivo))
    if (controlado) onAbiertoChange?.(true)
    else setAbiertoPropio(true)
  }
  const alCambiar = (v: boolean) => {
    if (controlado) onAbiertoChange?.(v)
    else setAbiertoPropio(v)
    if (v) return
    setAmplio(false)
    if (urlArchivo) { URL.revokeObjectURL(urlArchivo); setUrlArchivo(null) }
  }
  // Cuando lo abre quien controla el estado (sin pasar por `alAbrir`), igual hace
  // falta la URL de objeto y saber si el dispositivo es móvil. Se ajusta durante
  // el render, no en un efecto (evita el repinte extra de sincronizar con un
  // efecto): React permite fijar estado en el render mismo cuando reacciona a un
  // cambio de props, siempre que la condición evite el bucle.
  const [seguiaAbierto, setSeguiaAbierto] = useState(false)
  if (controlado && abiertoControlado && !seguiaAbierto) {
    setMovil(evaluarMovil())
    detectarTipo()
    if (archivo && !urlArchivo) setUrlArchivo(URL.createObjectURL(archivo))
    setSeguiaAbierto(true)
  } else if (controlado && !abiertoControlado && seguiaAbierto) {
    setSeguiaAbierto(false)
  }

  return (
    <>
      {children && (
        <button type="button" onClick={alAbrir} className={className}>
          {children}
        </button>
      )}
      <Dialog open={abierto} onOpenChange={alCambiar}>
        <DialogContent
          className={cn(
            'flex flex-col gap-2 p-3 transition-all sm:p-4',
            amplio ? 'h-[96dvh] w-[98vw] max-w-none sm:max-w-none' : 'h-[85dvh] w-full sm:max-w-3xl',
          )}
        >
          <DialogHeader className="flex-row items-center gap-1 space-y-0 pr-8">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm">{titulo}</DialogTitle>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setAmplio((a) => !a)} title={amplio ? 'Reducir' : 'Ampliar'}>
              {amplio ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Descargar">
              <a href={urlDescarga} download={archivo ? nombreDescarga : undefined}><Download className="size-4" /></a>
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Abrir en otra pestaña">
              <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a>
            </Button>
          </DialogHeader>
          {esperandoTipo ? (
            <div className="flex min-h-0 flex-1 items-center justify-center"><Spinner /></div>
          ) : tipo && !SE_PUEDE_VER(tipo) ? (
            // Un comprimido (el escaneo de un contrato viejo, por ejemplo) no se
            // puede mostrar: se ofrece descargarlo, que es lo único que tiene sentido.
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">Este archivo no se puede ver aquí. Descárgalo para abrirlo en tu computador.</p>
              <Button asChild size="sm">
                <a href={urlDescarga} download={archivo ? nombreDescarga : undefined}><Download className="size-4" /> Descargar</a>
              </Button>
            </div>
          ) : tipo?.startsWith('image/') ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={titulo} className="mx-auto max-w-full rounded-md bg-white shadow-sm" />
            </div>
          ) : movil ? (
            abierto && <PdfPaginas url={url} />
          ) : (
            <iframe src={url} title={titulo} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
          )}
          {pie}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Renderiza todas las páginas del PDF como canvas (móvil), con scroll vertical. */
function PdfPaginas({ url }: { url: string }) {
  const contRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')

  useEffect(() => {
    let cancelado = false
    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        const cont = contRef.current
        if (cancelado || !cont) return
        cont.innerHTML = ''
        const ancho = cont.clientWidth || 320
        const dpr = Math.min(window.devicePixelRatio || 1, 2) // nitidez sin reventar memoria
        for (let i = 1; i <= doc.numPages; i++) {
          const pagina = await doc.getPage(i)
          if (cancelado) return
          const base = pagina.getViewport({ scale: 1 })
          const viewport = pagina.getViewport({ scale: (ancho / base.width) * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.className = 'mb-2 rounded-md border bg-white shadow-sm'
          cont.appendChild(canvas)
          await pagina.render({ canvas, viewport }).promise
        }
        if (!cancelado) setEstado('ok')
      } catch {
        if (!cancelado) setEstado('error')
      }
    }
    render()
    return () => { cancelado = true }
  }, [url])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/40 p-2">
      {estado === 'cargando' && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner /> Cargando documento…
        </div>
      )}
      {estado === 'error' && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se pudo mostrar el documento aquí. Usa el botón de descarga o ábrelo en otra pestaña.
        </p>
      )}
      <div ref={contRef} />
    </div>
  )
}

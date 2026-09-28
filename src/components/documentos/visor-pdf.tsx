'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, ExternalLink, Download, ZoomIn, ZoomOut } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Visor de documentos embebido: abre el documento (PDF o foto) en un diálogo
 * dentro de la página, con opción de acercar, ampliar la ventana, descargar o
 * abrir en otra pestaña. Es el visor de todos los soportes, no solo de los PDF.
 *
 * En escritorio usa el visor nativo del navegador (iframe). En móvil los
 * navegadores NO renderizan PDF en iframes, así que se renderizan las páginas
 * con pdf.js sobre canvas (carga diferida; el worker vive en /pdf.worker.min.mjs).
 * Las lupas propias aplican a las fotos y a ese PDF del celular; en escritorio
 * el visor nativo del navegador ya trae su propio acercamiento.
 */
/** Niveles de acercamiento: 1 = ajustado al ancho de la ventana. */
const NIVELES_ZOOM = [0.5, 0.75, 1, 1.5, 2, 3, 4]
const ZOOM_MIN = NIVELES_ZOOM[0]
const ZOOM_MAX = NIVELES_ZOOM[NIVELES_ZOOM.length - 1]
const acotarZoom = (z: number) => Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX)
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
  const [zoom, setZoom] = useState(1)
  // Con los dedos el acercamiento es continuo; las lupas saltan al nivel
  // siguiente o anterior de la escala, partiendo de donde esté.
  const acercar = (paso: 1 | -1) => setZoom((z) =>
    paso === 1
      ? NIVELES_ZOOM.find((n) => n > z + 0.01) ?? ZOOM_MAX
      : NIVELES_ZOOM.findLast((n) => n < z - 0.01) ?? ZOOM_MIN)
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
    setZoom(1)
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

  const vista = esperandoTipo ? 'espera'
    : tipo && !SE_PUEDE_VER(tipo) ? 'descarga'
    : tipo?.startsWith('image/') ? 'imagen'
    : movil ? 'paginas'
    : 'nativo'
  const conZoom = vista === 'imagen' || vista === 'paginas'

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
            {conZoom && (
              <div className="flex items-center">
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => acercar(-1)} disabled={zoom <= ZOOM_MIN} title="Alejar" aria-label="Alejar">
                  <ZoomOut className="size-4" />
                </Button>
                {/* El porcentaje devuelve al tamaño ajustado a la ventana. */}
                <button type="button" onClick={() => setZoom(1)} className="w-10 rounded text-center text-xs tabular-nums text-muted-foreground hover:text-foreground" title="Ajustar a la ventana">
                  {Math.round(zoom * 100)}%
                </button>
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => acercar(1)} disabled={zoom >= ZOOM_MAX} title="Acercar" aria-label="Acercar">
                  <ZoomIn className="size-4" />
                </Button>
              </div>
            )}
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setAmplio((a) => !a)} title={amplio ? 'Reducir ventana' : 'Pantalla completa'} aria-label={amplio ? 'Reducir ventana' : 'Pantalla completa'}>
              {amplio ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Descargar">
              <a href={urlDescarga} download={archivo ? nombreDescarga : undefined} aria-label="Descargar"><Download className="size-4" /></a>
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Abrir en otra pestaña">
              <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en otra pestaña"><ExternalLink className="size-4" /></a>
            </Button>
          </DialogHeader>
          {vista === 'espera' ? (
            <div className="flex min-h-0 flex-1 items-center justify-center"><Spinner /></div>
          ) : vista === 'descarga' ? (
            // Un comprimido (el escaneo de un contrato viejo, por ejemplo) no se
            // puede mostrar: se ofrece descargarlo, que es lo único que tiene sentido.
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">Este archivo no se puede ver aquí. Descárgalo para abrirlo en tu computador.</p>
              <Button asChild size="sm">
                <a href={urlDescarga} download={archivo ? nombreDescarga : undefined}><Download className="size-4" /> Descargar</a>
              </Button>
            </div>
          ) : vista === 'imagen' ? (
            <MarcoZoom zoom={zoom} setZoom={setZoom}>
              {/* Ajustada (100 %) la foto cabe a lo ancho sin estirarse; al
                  acercar se agranda sobre el ancho de la ventana. Doble clic
                  alterna entre ajustada y al doble. */}
              <div className="mx-auto" style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={titulo}
                  draggable={false}
                  onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
                  className={cn('mx-auto rounded-md bg-white shadow-sm', zoom === 1 ? 'max-w-full' : 'w-full')}
                />
              </div>
            </MarcoZoom>
          ) : vista === 'paginas' ? (
            abierto && <PdfPaginas url={url} zoom={zoom} setZoom={setZoom} />
          ) : (
            <iframe src={url} title={titulo} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
          )}
          {pie}
        </DialogContent>
      </Dialog>
    </>
  )
}


/**
 * Marco con scroll del documento acercado, con los gestos de cualquier visor
 * de fotos:
 *  - Con los dedos: separarlos acerca y juntarlos aleja (pellizco), y el punto
 *    entre los dos dedos se queda quieto. Un solo dedo desplaza, como siempre.
 *  - Con el mouse: arrastrar para moverse por el documento acercado.
 *
 * El pellizco va con eventos táctiles nativos y no con los de React: hay que
 * cancelarlos (`preventDefault`) para que el navegador no amplíe la página
 * entera en vez del documento, y React los registra como pasivos.
 */
function MarcoZoom({ zoom, setZoom, children }: { zoom: number; setZoom: (z: number) => void; children: ReactNode }) {
  const marcoRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const arrastre = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  // Punto del contenido bajo los dedos, medido al empezar el pellizco.
  const ancla = useRef<{ distancia: number; zoom: number; cx: number; cy: number; mx: number; my: number } | null>(null)

  // Tras cada cambio del pellizco se corre el scroll para que el punto entre
  // los dedos no se escape; antes del pintado, para que no salte.
  useLayoutEffect(() => {
    zoomRef.current = zoom
    const a = ancla.current
    const marco = marcoRef.current
    if (!a || !marco) return
    const r = zoom / a.zoom
    marco.scrollLeft = a.cx * r - a.mx
    marco.scrollTop = a.cy * r - a.my
  }, [zoom])

  useEffect(() => {
    const marco = marcoRef.current
    if (!marco) return
    const dedos = (t: TouchList) => {
      const caja = marco.getBoundingClientRect()
      const [p, q] = [t[0], t[1]]
      return {
        distancia: Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY),
        mx: (p.clientX + q.clientX) / 2 - caja.left,
        my: (p.clientY + q.clientY) / 2 - caja.top,
      }
    }
    const alTocar = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const d = dedos(e.touches)
      ancla.current = { ...d, zoom: zoomRef.current, cx: marco.scrollLeft + d.mx, cy: marco.scrollTop + d.my }
    }
    const alMover = (e: TouchEvent) => {
      const a = ancla.current
      if (!a || e.touches.length !== 2) return
      e.preventDefault()
      setZoom(acotarZoom(a.zoom * (dedos(e.touches).distancia / a.distancia)))
    }
    const alSoltar = (e: TouchEvent) => { if (e.touches.length < 2) ancla.current = null }
    marco.addEventListener('touchstart', alTocar, { passive: false })
    marco.addEventListener('touchmove', alMover, { passive: false })
    marco.addEventListener('touchend', alSoltar)
    marco.addEventListener('touchcancel', alSoltar)
    return () => {
      marco.removeEventListener('touchstart', alTocar)
      marco.removeEventListener('touchmove', alMover)
      marco.removeEventListener('touchend', alSoltar)
      marco.removeEventListener('touchcancel', alSoltar)
    }
  }, [setZoom])

  return (
    <div
      ref={marcoRef}
      className={cn('min-h-0 flex-1 overflow-auto rounded-md bg-muted/40 p-2', zoom > 1 && 'cursor-grab active:cursor-grabbing')}
      onPointerDown={(e) => {
        if (zoom <= 1 || e.pointerType !== 'mouse') return
        arrastre.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const i = arrastre.current
        if (!i) return
        e.currentTarget.scrollLeft = i.left - (e.clientX - i.x)
        e.currentTarget.scrollTop = i.top - (e.clientY - i.y)
      }}
      onPointerUp={() => { arrastre.current = null }}
      onPointerCancel={() => { arrastre.current = null }}
    >
      {children}
    </div>
  )
}

/**
 * Renderiza todas las páginas del PDF como canvas (móvil), con scroll. Al
 * acercar, las páginas se agrandan y se vuelven a pintar con más resolución
 * hasta el doble; más allá se estiran, para no reventar la memoria del celular.
 */
function PdfPaginas({ url, zoom, setZoom }: { url: string; zoom: number; setZoom: (z: number) => void }) {
  const contRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<{ url: string; doc: PDFDocumentProxy } | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')
  // Por tramos: el pellizco cambia el zoom a cada movimiento y no se repinta en cada uno.
  const nitidez = zoom >= 1.75 ? 2 : zoom >= 1.25 ? 1.5 : 1

  useEffect(() => {
    let cancelado = false
    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        // El documento se baja una vez; acercar solo lo vuelve a pintar.
        if (docRef.current?.url !== url) docRef.current = { url, doc: await pdfjs.getDocument({ url }).promise }
        const doc = docRef.current.doc
        const cont = contRef.current
        if (cancelado || !cont) return
        // El ancho de referencia es el del marco, no el de las páginas ya agrandadas.
        const ancho = (cont.parentElement?.clientWidth ?? 0) - 16 || 320
        const dpr = Math.min(window.devicePixelRatio || 1, 2) // nitidez sin reventar memoria
        for (let i = 1; i <= doc.numPages; i++) {
          const pagina = await doc.getPage(i)
          if (cancelado) return
          const base = pagina.getViewport({ scale: 1 })
          const viewport = pagina.getViewport({ scale: (ancho / base.width) * dpr * nitidez })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.className = 'mb-2 rounded-md border bg-white shadow-sm'
          await pagina.render({ canvas, viewport }).promise
          if (cancelado) return
          // Al repintar se copia sobre la MISMA página, no se cambia por otra: el
          // navegador sigue mandando el pellizco al elemento que tocaron los
          // dedos, y si se quita del documento el gesto se pierde a la mitad.
          // Copiar en la misma tarea no parpadea, y no devuelve el scroll al inicio.
          const previa = cont.children[i - 1] as HTMLCanvasElement | undefined
          if (previa) {
            previa.width = canvas.width
            previa.height = canvas.height
            previa.getContext('2d')?.drawImage(canvas, 0, 0)
          } else cont.appendChild(canvas)
        }
        if (!cancelado) setEstado('ok')
      } catch {
        if (!cancelado) setEstado('error')
      }
    }
    render()
    return () => { cancelado = true }
  }, [url, nitidez])

  return (
    <MarcoZoom zoom={zoom} setZoom={setZoom}>
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
      <div ref={contRef} className="mx-auto" style={{ width: `${zoom * 100}%` }} />
    </MarcoZoom>
  )
}

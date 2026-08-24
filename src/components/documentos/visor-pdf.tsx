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
export function VisorPdf({
  documentoId,
  titulo,
  className,
  children,
  mimeType,
}: {
  documentoId: string
  titulo: string
  className?: string
  children: ReactNode
  /**
   * Tipo del archivo. Las listas de documentos mezclan PDF con fotos de cédulas
   * y soportes escaneados: una imagen se muestra tal cual, porque pdf.js no
   * sabría abrirla y el iframe la dejaría a tamaño original.
   */
  mimeType?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [amplio, setAmplio] = useState(false)
  const url = `/api/documentos/${documentoId}`
  // Pantalla táctil o angosta → el iframe no muestra PDFs: usar pdf.js.
  // Se evalúa al abrir (evento de usuario), no en un efecto.
  const [movil, setMovil] = useState(false)
  const alAbrir = () => {
    setMovil(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    setAbierto(true)
  }

  return (
    <>
      <button type="button" onClick={alAbrir} className={className}>
        {children}
      </button>
      <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) setAmplio(false) }}>
        <DialogContent
          className={cn(
            'flex flex-col gap-2 p-3 transition-all sm:p-4',
            amplio ? 'h-[96dvh] w-[98vw] max-w-none sm:max-w-none' : 'h-[80dvh] w-full sm:max-w-3xl',
          )}
        >
          <DialogHeader className="flex-row items-center gap-1 space-y-0 pr-8">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm">{titulo}</DialogTitle>
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setAmplio((a) => !a)} title={amplio ? 'Reducir' : 'Ampliar'}>
              {amplio ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Descargar">
              <a href={`${url}?descargar=1`}><Download className="size-4" /></a>
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7" asChild title="Abrir en otra pestaña">
              <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a>
            </Button>
          </DialogHeader>
          {mimeType?.startsWith('image/') ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={titulo} className="mx-auto max-w-full rounded-md bg-white shadow-sm" />
            </div>
          ) : movil ? (
            abierto && <PdfPaginas url={url} />
          ) : (
            <iframe src={url} title={titulo} className="min-h-0 w-full flex-1 rounded-md border bg-white" />
          )}
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react'

/**
 * Elegir dónde va cada firma dentro de un PDF subido.
 *
 * La app propone la posición leyendo la capa de texto del PDF, pero nunca firma
 * a ciegas: aquí se ve el documento y se arrastra el recuadro de cada parte. Si
 * el PDF es un escaneo no hay nada que proponer y esto es la única forma de
 * indicarlo, así que el selector funciona igual con o sin detección.
 *
 * Coordenadas: el canvas mide en píxeles desde arriba-izquierda y el PDF en
 * puntos desde abajo-izquierda. La conversión vive en `aPuntosPdf` /
 * `aPixeles`, en un solo lugar, porque es donde un signo cambiado deja la firma
 * fuera de la hoja sin que nadie lo note hasta que el contrato ya circuló.
 */

export type Posicion = { pagina: number; x: number; y: number; ancho: number; alto: number }
type Parte = 'contratista' | 'contratante'

const ETIQUETA: Record<Parte, string> = {
  contratista: 'Firma del contratista',
  contratante: 'Firma de la empresa',
}
const COLOR: Record<Parte, string> = {
  contratista: 'border-sky-500 bg-sky-500/15',
  contratante: 'border-emerald-500 bg-emerald-500/15',
}

export function SelectorFirmasPdf({
  pdfDataUri,
  paginas,
  valor,
  onChange,
}: {
  pdfDataUri: string
  paginas: number
  valor: Record<Parte, Posicion>
  onChange: (v: Record<Parte, Posicion>) => void
}) {
  const [pagina, setPagina] = useState(valor.contratista.pagina)
  const [cargando, setCargando] = useState(true)
  // Alto de la página en puntos PDF: hace falta para invertir el eje Y.
  const [altoPuntos, setAltoPuntos] = useState(792)
  const [arrastrando, setArrastrando] = useState<Parte | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contRef = useRef<HTMLDivElement>(null)
  // Escala pixeles-CSS por punto PDF. Es ESTADO, no ref: los recuadros se dibujan
  // con ella en el render, y como ref no se repintarian al cambiar el tamano.
  const [escala, setEscala] = useState(1)

  // ── render de la página con pdf.js (mismo enfoque que el visor de documentos) ──
  useEffect(() => {
    let cancelado = false
    async function render() {
      setCargando(true)
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url: pdfDataUri }).promise
        if (cancelado) return
        const p = await doc.getPage(Math.min(pagina, doc.numPages))
        const base = p.getViewport({ scale: 1 })
        const ancho = contRef.current?.clientWidth ?? 600
        const escala = ancho / base.width
        const viewport = p.getViewport({ scale: escala })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = '100%'
        await p.render({ canvas, viewport }).promise
        if (cancelado) return
        setEscala(escala)
        setAltoPuntos(base.height)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    render()
    return () => { cancelado = true }
  }, [pdfDataUri, pagina])

  /** Punto PDF (origen abajo-izq) → píxel CSS dentro del canvas (origen arriba-izq). */
  const aPixeles = useCallback(
    (p: Posicion) => ({
      left: p.x * escala,
      // Se resta el alto porque en el PDF (x,y) es la esquina INFERIOR del recuadro.
      top: (altoPuntos - p.y - p.alto) * escala,
      width: p.ancho * escala,
      height: p.alto * escala,
    }),
    [altoPuntos, escala],
  )

  /** Píxel CSS del canvas → punto PDF, con el recuadro centrado en el cursor. */
  const aPuntosPdf = useCallback(
    (px: number, py: number, base: Posicion): Posicion => {
      const e = escala
      const x = px / e - base.ancho / 2
      const yDesdeArriba = py / e - base.alto / 2
      return {
        ...base,
        pagina,
        // Se acota a la hoja: una firma fuera de la página no se ve y nadie se entera.
        x: Math.max(0, x),
        y: Math.max(0, altoPuntos - yDesdeArriba - base.alto),
      }
    },
    [altoPuntos, pagina, escala],
  )

  function moverA(e: React.MouseEvent, parte: Parte) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange({ ...valor, [parte]: aPuntosPdf(e.clientX - rect.left, e.clientY - rect.top, valor[parte]) })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5"><PenLine className="size-4" /> Dónde firma cada parte</Label>
        {paginas > 1 && (
          <div className="flex items-center gap-1 text-sm">
            <Button type="button" size="icon" variant="ghost" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums text-muted-foreground">{pagina} / {paginas}</span>
            <Button type="button" size="icon" variant="ghost" onClick={() => setPagina((p) => Math.min(paginas, p + 1))} disabled={pagina >= paginas} aria-label="Página siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Arrastra cada recuadro hasta la línea de firma. Solo se muestran los de la página que estás viendo.
      </p>

      <div ref={contRef} className="relative overflow-hidden rounded-lg border bg-white">
        {cargando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Spinner className="size-5" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="block w-full"
          onMouseMove={(e) => { if (arrastrando) moverA(e, arrastrando) }}
          onMouseUp={() => setArrastrando(null)}
          onMouseLeave={() => setArrastrando(null)}
        />
        {(['contratante', 'contratista'] as Parte[]).map((parte) => {
          const p = valor[parte]
          if (p.pagina !== pagina) return null
          const caja = aPixeles(p)
          return (
            <div
              key={parte}
              role="button"
              tabIndex={0}
              onMouseDown={() => setArrastrando(parte)}
              style={{ left: caja.left, top: caja.top, width: caja.width, height: caja.height }}
              className={`absolute cursor-move rounded border-2 border-dashed ${COLOR[parte]} flex items-center justify-center text-[10px] font-medium`}
            >
              {ETIQUETA[parte]}
            </div>
          )
        })}
      </div>

      {/* Si una firma quedó en otra página, hay que poder llegar a ella. */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(['contratante', 'contratista'] as Parte[]).map((parte) => (
          <button
            key={parte}
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => setPagina(valor[parte].pagina)}
          >
            {ETIQUETA[parte]}: página {valor[parte].pagina}
          </button>
        ))}
      </div>
    </div>
  )
}

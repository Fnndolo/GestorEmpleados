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
 * puntos desde abajo-izquierda. La conversión vive en `aPixeles` / `aPuntosPdf`,
 * en un solo lugar, porque es donde un signo cambiado deja la firma fuera de la
 * hoja sin que nadie lo note hasta que el contrato ya circuló.
 *
 * El arrastre usa eventos de puntero con captura, no mouse sobre el canvas: los
 * recuadros van ENCIMA del canvas, así que apenas empezaba el arrastre el cursor
 * dejaba de estar sobre él y el movimiento se cortaba. Con `setPointerCapture`
 * el recuadro sigue recibiendo el puntero aunque se salga del documento, y de
 * paso funciona igual con el dedo.
 */

export type Posicion = { pagina: number; x: number; y: number; ancho: number; alto: number }
type Parte = 'contratista' | 'contratante'

const ETIQUETA: Record<Parte, string> = {
  contratista: 'Firma del contratista',
  contratante: 'Firma de la empresa',
}
const COLOR: Record<Parte, string> = {
  contratista: 'border-sky-500 bg-sky-500/15 text-sky-900 dark:text-sky-100',
  contratante: 'border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
}

/** Cuánto mueve cada flecha del teclado, en puntos PDF (Shift = 10×). */
const PASO_TECLADO = 1

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
  // Arranca en la pagina de la firma ya propuesta. Al elegir otro PDF el padre
  // remonta este componente (key), asi que no hace falta sincronizar nada.
  const [pagina, setPagina] = useState(valor.contratista.pagina)
  const [cargando, setCargando] = useState(true)
  // Tamaño de la página en puntos PDF: hace falta para invertir el eje Y y para
  // que el recuadro no se pueda sacar de la hoja.
  const [altoPuntos, setAltoPuntos] = useState(792)
  const [anchoPuntos, setAnchoPuntos] = useState(612)
  const [arrastrando, setArrastrando] = useState<Parte | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contRef = useRef<HTMLDivElement>(null)
  // Escala pixeles-CSS por punto PDF. Es ESTADO, no ref: los recuadros se dibujan
  // con ella en el render, y como ref no se repintarían al cambiar el tamaño.
  const [escala, setEscala] = useState(1)
  /**
   * Desfase entre el punto donde se agarró el recuadro y su esquina, en píxeles.
   * Sin esto el recuadro salta para centrarse en el cursor apenas se toca, que es
   * justo lo que hace imposible ajustarlo con precisión.
   */
  const agarreRef = useRef({ dx: 0, dy: 0 })

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
        const esc = ancho / base.width
        const viewport = p.getViewport({ scale: esc })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = '100%'
        await p.render({ canvas, viewport }).promise
        if (cancelado) return
        setEscala(esc)
        setAltoPuntos(base.height)
        setAnchoPuntos(base.width)
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

  /** Deja el recuadro dentro de la hoja: fuera de ella la firma no se vería. */
  const acotar = useCallback(
    (p: Posicion): Posicion => ({
      ...p,
      x: Math.min(Math.max(0, p.x), Math.max(0, anchoPuntos - p.ancho)),
      y: Math.min(Math.max(0, p.y), Math.max(0, altoPuntos - p.alto)),
    }),
    [anchoPuntos, altoPuntos],
  )

  function moverParte(parte: Parte, e: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const base = valor[parte]
    // Esquina superior-izquierda en píxeles, respetando dónde se agarró.
    const leftPx = e.clientX - rect.left - agarreRef.current.dx
    const topPx = e.clientY - rect.top - agarreRef.current.dy
    onChange({
      ...valor,
      [parte]: acotar({
        ...base,
        pagina,
        x: leftPx / escala,
        y: altoPuntos - topPx / escala - base.alto,
      }),
    })
  }

  function empezarArrastre(parte: Parte, e: React.PointerEvent<HTMLDivElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    agarreRef.current = { dx: e.clientX - caja.left, dy: e.clientY - caja.top }
    // El recuadro se queda con el puntero aunque el cursor salga del documento.
    e.currentTarget.setPointerCapture(e.pointerId)
    setArrastrando(parte)
  }

  function nudge(parte: Parte, e: React.KeyboardEvent) {
    const paso = PASO_TECLADO * (e.shiftKey ? 10 : 1)
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0],
      ArrowUp: [0, paso], ArrowDown: [0, -paso], // en PDF, arriba es +y
    }
    const d = delta[e.key]
    if (!d) return
    e.preventDefault()
    const base = valor[parte]
    onChange({ ...valor, [parte]: acotar({ ...base, x: base.x + d[0], y: base.y + d[1] }) })
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
            {pagina !== paginas && (
              // Las firmas casi siempre van al final: un atajo evita pasar hoja por hoja.
              <Button type="button" size="sm" variant="ghost" onClick={() => setPagina(paginas)}>Última</Button>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Arrastra cada recuadro hasta la línea de firma. Con el recuadro seleccionado, las flechas lo mueven punto a punto (Shift, de a 10).
      </p>

      <div ref={contRef} className="relative overflow-hidden rounded-lg border bg-white">
        {cargando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Spinner className="size-5" />
          </div>
        )}
        <canvas ref={canvasRef} className="block w-full select-none" />
        {(['contratante', 'contratista'] as Parte[]).map((parte) => {
          const p = valor[parte]
          if (p.pagina !== pagina) return null
          const caja = aPixeles(p)
          return (
            <div
              key={parte}
              role="button"
              tabIndex={0}
              aria-label={`${ETIQUETA[parte]}: arrastra o usa las flechas para ubicarla`}
              onPointerDown={(e) => empezarArrastre(parte, e)}
              onPointerMove={(e) => { if (arrastrando === parte) moverParte(parte, e) }}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); setArrastrando(null) }}
              onPointerCancel={() => setArrastrando(null)}
              onKeyDown={(e) => nudge(parte, e)}
              style={{
                left: caja.left, top: caja.top, width: caja.width, height: caja.height,
                // Sin esto, arrastrar con el dedo desplaza la página en vez del recuadro.
                touchAction: 'none',
              }}
              className={`absolute flex select-none items-center justify-center rounded border-2 border-dashed text-[10px] font-medium outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-primary ${COLOR[parte]} ${
                arrastrando === parte ? 'cursor-grabbing opacity-90 shadow-lg' : 'cursor-grab'
              }`}
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

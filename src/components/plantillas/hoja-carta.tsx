'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Hoja carta (612 × 792 pt) escalada para caber en el panel, con las mismas
 * métricas que los PDF de la app. Es la base de las vistas previas rápidas de
 * Ajustes → Plantillas de documentos: el documento corre continuo (no pagina),
 * pero fuente, márgenes y tamaños son los del PDF.
 */

/** La fuente de los documentos legales, disponible también en el navegador. */
const FUENTE = `
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-regular.ttf') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-bold.ttf') format('truetype'); font-weight: bold; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-italic.ttf') format('truetype'); font-weight: normal; font-style: italic; }
`

/** Ancho de la hoja carta en px CSS (612pt × 1.333). */
const ANCHO_HOJA_PX = 816

export function HojaCarta({
  children,
  membrete = true,
  padding = '122pt 72pt 96pt',
  fuente = 'bookman',
  version = 0,
  paginada = false,
}: {
  children: React.ReactNode
  /** Pinta detrás el papel membretado vigente (el de Ajustes o el de fábrica). */
  membrete?: boolean
  /** Márgenes del PDF correspondiente, en puntos. */
  padding?: string
  fuente?: 'bookman' | 'helvetica'
  /** Cambia para que el navegador no reutilice el membrete en caché. */
  version?: number
  /**
   * Hoja de alto fijo (una página exacta) que recorta lo que sobre: para las
   * vistas previas que reparten el contenido en varias hojas. Sin esto la hoja
   * crece con el contenido, que es cómodo pero esconde que el PDF cambiaría de página.
   */
  paginada?: boolean
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const hoja = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)
  const [altoEscalado, setAltoEscalado] = useState<number | undefined>(undefined)

  useEffect(() => {
    const medir = () => {
      const anchoPanel = contenedor.current?.clientWidth ?? ANCHO_HOJA_PX
      const s = Math.min(1, anchoPanel / ANCHO_HOJA_PX)
      setEscala(s)
      if (hoja.current) setAltoEscalado(hoja.current.offsetHeight * s)
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (contenedor.current) ro.observe(contenedor.current)
    if (hoja.current) ro.observe(hoja.current)
    return () => ro.disconnect()
  }, [])

  return (
    // El contenedor mide el ancho disponible y recorta el alto sobrante del escalado.
    <div ref={contenedor} className="overflow-hidden" style={{ height: altoEscalado }}>
      <div
        ref={hoja}
        className="relative bg-white shadow-sm ring-1 ring-slate-200"
        style={{
          transform: `scale(${escala})`,
          transformOrigin: 'top left',
          width: '612pt',
          ...(paginada ? { height: '792pt', overflow: 'hidden' } : { minHeight: '792pt' }),
          padding,
          fontFamily: fuente === 'bookman' ? "'Bookman Preview', 'Bookman Old Style', Georgia, serif" : 'Helvetica, Arial, sans-serif',
          fontSize: '10.5pt',
          lineHeight: 1.5,
          color: '#0f172a',
        }}
      >
        <style>{FUENTE}</style>
        {membrete && (
          // Una sola hoja de membrete (la primera página); vive detrás de la sesión.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            aria-hidden
            alt=""
            src={`/api/configuracion/membrete?v=${version}`}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: '612pt', height: '792pt' }}
          />
        )}
        <div className="relative">{children}</div>
      </div>
    </div>
  )
}

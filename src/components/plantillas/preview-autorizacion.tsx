'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { HojaCarta } from './hoja-carta'
import {
  resolverAutorizacion, rolFirmaAutorizacion, type DatosAutorizacion, type PlantillaAutorizacion, type Tramo,
} from '@/lib/plantillas-documento/autorizacion-datos'
import { paginar, type BloqueMedido, type Trozo } from '@/lib/plantillas-documento/paginar'

/**
 * Vista previa de la autorización de datos calcada del PDF
 * (src/server/pdf/autorizacion-datos.tsx): misma hoja, márgenes, fuente y
 * tamaños, y PAGINADA como el PDF: el contenido se mide en el navegador y se
 * reparte en hojas carta; un párrafo se parte por líneas completas y el bloque
 * de firma pasa entero a la hoja siguiente si no cabe (wrap={false} en el PDF).
 * Así, si el documento va a ocupar dos hojas, aquí se ven dos hojas.
 *
 * La firma se dibuja como quedará FIRMADA (recuadro de la firma y la línea
 * "Firmado electrónicamente"), que es el documento que importa.
 */

/** Métricas del PDF (pt): hoja carta, márgenes de la página y ancho útil del texto. */
const ALTO_HOJA = 792
const MARGEN_ARRIBA = 122
const MARGEN_ABAJO = 96
const DISPONIBLE = ALTO_HOJA - MARGEN_ARRIBA - MARGEN_ABAJO // 574
const ANCHO_TEXTO = '468pt' // 612 − 2 × 72
const PX_A_PT = 0.75

/** Interlineados en pt (fontSize × 1.5). */
const LINEA_TEXTO = 10.5 * 1.5
const LINEA_TITULO = 11.5 * 1.5
const LINEA_SUBTITULO = 10 * 1.5
const LINEA_NOTA = 8 * 1.5

/** Mismos valores que el StyleSheet del PDF. */
const M = { fecha: 12, subtitulo: 12, parrafo: 10, item: 6, itemSangria: 18, itemMarca: 18, firmaArriba: 16, firmaEspacio: 44, notaArriba: 24 }

const ESTILO_TEXTO: React.CSSProperties = {
  fontFamily: "'Bookman Preview', 'Bookman Old Style', Georgia, serif",
  fontSize: '10.5pt',
  lineHeight: 1.5,
  color: '#0f172a',
}

type Bloque = {
  key: string
  nodo: ReactNode
  margenArriba: number
  margenAbajo: number
  interlineado: number
  divisible: boolean
}

function Tramos({ tramos }: { tramos: Tramo[] }) {
  return (
    <>
      {tramos.map((t, j) => (
        <span key={j} style={{ fontWeight: t.negrita ? 'bold' : undefined, textDecoration: t.subrayado ? 'underline' : undefined }}>
          {t.texto}
        </span>
      ))}
    </>
  )
}

function bloquesDe(plantilla: PlantillaAutorizacion, datos: DatosAutorizacion): Bloque[] {
  const r = resolverAutorizacion(plantilla, datos)
  return [
    { key: 'fecha', nodo: <div>{datos.ciudadFecha}</div>, margenArriba: 0, margenAbajo: M.fecha, interlineado: LINEA_TEXTO, divisible: false },
    {
      key: 'titulo',
      nodo: <div style={{ fontWeight: 'bold', fontSize: '11.5pt', textAlign: 'center', color: '#0f172a' }}>{r.titulo || ' '}</div>,
      margenArriba: 0, margenAbajo: 0, interlineado: LINEA_TITULO, divisible: false,
    },
    {
      key: 'subtitulo',
      nodo: <div style={{ fontSize: '10pt', textAlign: 'center' }}>{datos.empresa.razonSocial} - NIT No. {datos.empresa.nit}</div>,
      margenArriba: 0, margenAbajo: M.subtitulo, interlineado: LINEA_SUBTITULO, divisible: false,
    },
    ...r.parrafos.map((p, i): Bloque => ({
      key: `p${i}`,
      nodo: p.vineta ? (
        <div style={{ display: 'flex', paddingLeft: `${M.itemSangria}pt` }}>
          <span style={{ width: `${M.itemMarca}pt`, flexShrink: 0 }}>{p.vineta}</span>
          <p style={{ margin: 0, flex: 1, textAlign: 'justify' }}><Tramos tramos={p.tramos} /></p>
        </div>
      ) : (
        <p style={{ margin: 0, textAlign: 'justify' }}><Tramos tramos={p.tramos} /></p>
      ),
      margenArriba: 0, margenAbajo: p.vineta ? M.item : M.parrafo, interlineado: LINEA_TEXTO, divisible: true,
    })),
    {
      key: 'firma',
      nodo: (
        <div>
          {/* Donde va la firma dibujada (mismo alto que la imagen en el PDF) */}
          <div
            style={{ height: `${M.firmaEspacio}pt`, width: '160pt', border: '1px dashed #cbd5e1', borderRadius: '4pt', color: '#94a3b8', fontSize: '7.5pt', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            firma
          </div>
          <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt', width: '62%' }}>
            <div style={{ fontWeight: 'bold' }}>{datos.nombre}</div>
            <div>CC. {datos.cedula}</div>
            <div>{rolFirmaAutorizacion(datos.vinculo)} {datos.cargo}</div>
            <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '2pt' }}>Firmado electrónicamente el (fecha de la firma)</div>
          </div>
        </div>
      ),
      margenArriba: M.firmaArriba, margenAbajo: 0, interlineado: LINEA_TEXTO, divisible: false,
    },
    ...r.notas.map((n, i): Bloque => ({
      key: `n${i}`,
      nodo: (
        <p style={{ margin: 0, fontSize: '8pt', color: '#64748b', textAlign: 'center' }}><Tramos tramos={n} /></p>
      ),
      margenArriba: M.notaArriba, margenAbajo: 0, interlineado: LINEA_NOTA, divisible: false,
    })),
  ]
}

export function PreviewAutorizacion({
  plantilla, datos, version,
}: {
  plantilla: PlantillaAutorizacion
  datos: DatosAutorizacion
  version?: number
}) {
  const bloques = useMemo(() => bloquesDe(plantilla, datos), [plantilla, datos])
  const medidor = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<Trozo[][] | null>(null)

  // Se miden los bloques en un contenedor invisible con el ancho de texto del
  // PDF y se reparten en hojas. Se vuelve a medir cuando cambia el texto, cuando
  // termina de cargar la fuente (cambian los anchos) y ante cualquier reflujo.
  useEffect(() => {
    const cont = medidor.current
    if (!cont) return
    const medir = () => {
      const hijos = Array.from(cont.children) as HTMLElement[]
      if (hijos.length !== bloques.length) return
      const medidos: BloqueMedido[] = hijos.map((h, i) => ({
        alto: h.offsetHeight * PX_A_PT,
        margenArriba: bloques[i].margenArriba,
        margenAbajo: bloques[i].margenAbajo,
        interlineado: bloques[i].interlineado,
        divisible: bloques[i].divisible,
      }))
      setPaginas(paginar(medidos, DISPONIBLE))
    }
    const ro = new ResizeObserver(medir)
    for (const h of Array.from(cont.children)) ro.observe(h)
    const raf = requestAnimationFrame(medir)
    document.fonts?.ready.then(medir).catch(() => {})
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [bloques])

  // Mientras no haya medidas: todo en una hoja, sin recortes.
  const hojas: Trozo[][] = paginas ?? [bloques.map((_, i) => ({ bloque: i, desde: 0, alto: 0, inicio: true, fin: true }))]

  return (
    <div className="space-y-4">
      {/* Medidor: mismo ancho y fuente que la hoja; sin alto para no estirar el panel. */}
      <div aria-hidden ref={medidor} style={{ ...ESTILO_TEXTO, width: ANCHO_TEXTO, height: 0, overflow: 'hidden', visibility: 'hidden' }}>
        {bloques.map((b) => <div key={b.key}>{b.nodo}</div>)}
      </div>

      {hojas.map((hoja, n) => (
        <div key={n}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Página {n + 1} de {hojas.length}
          </p>
          <HojaCarta version={version} paginada>
            {hoja.map((t) => {
              const b = bloques[t.bloque]
              const recortado = paginas !== null
              return (
                <div
                  key={`${b.key}-${t.desde}`}
                  style={{
                    marginTop: t.inicio ? `${b.margenArriba}pt` : 0,
                    marginBottom: t.fin ? `${b.margenAbajo}pt` : 0,
                    ...(recortado ? { height: `${t.alto}pt`, overflow: 'hidden' } : {}),
                  }}
                >
                  <div style={{ marginTop: t.desde ? `-${t.desde}pt` : 0 }}>{b.nodo}</div>
                </div>
              )
            })}
          </HojaCarta>
        </div>
      ))}
    </div>
  )
}

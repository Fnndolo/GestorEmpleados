'use client'

import { useEffect, useRef, useState } from 'react'
import { resolverPlantilla, type DatosContrato, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'
import { pesosALetras, mesesALetras, fechaLarga } from '@/lib/numero-letras'

type PlantillaBase = { titulo: string; intro: string; cierre?: string; clausulas: ClausulaPlantilla[] } | null

function celda(valor?: string | null) {
  return valor && valor.trim() ? valor : '__________'
}

/**
 * Vista previa del contrato calcada del PDF real (src/server/pdf/contrato-ops.tsx):
 * misma fuente (Bookman Old Style, extraída a public/fonts), hoja carta con los
 * mismos márgenes en puntos (122pt / 72pt / 96pt), y los mismos tamaños, bordes
 * y colores del StyleSheet del PDF. La única diferencia restante es la paginación:
 * aquí el documento corre continuo; el PDF corta en páginas carta.
 */

/** La fuente del PDF, disponible también en el navegador. */
const FUENTE = `
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-regular.ttf') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-bold.ttf') format('truetype'); font-weight: bold; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-italic.ttf') format('truetype'); font-weight: normal; font-style: italic; }
`

/** Ancho de la hoja carta en px CSS (612pt × 1.333). */
const ANCHO_HOJA_PX = 816

export function PreviewContrato({
  plantilla,
  datos,
  funciones,
}: {
  plantilla: PlantillaBase
  datos: DatosContrato
  funciones: FuncionesCargo | null
}) {
  // La hoja tiene tamaño carta fijo; se escala para caber en el panel sin scroll horizontal.
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
  })

  if (!plantilla) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        No hay una plantilla OPS configurada. Ejecuta el seed de plantillas.
      </div>
    )
  }

  const r = resolverPlantilla(plantilla, datos, funciones)
  const c = datos.contrato

  return (
    // El contenedor mide el ancho disponible y recorta el alto sobrante del escalado.
    <div ref={contenedor} className="overflow-hidden" style={{ height: altoEscalado }}>
    <div
      ref={hoja}
      className="relative bg-white shadow-sm ring-1 ring-slate-200"
      style={{
        // Hoja carta EXACTA del PDF (612×792pt), escalada para caber sin scroll horizontal.
        transform: `scale(${escala})`,
        transformOrigin: 'top left',
        width: '612pt',
        minHeight: '792pt',
        // Métricas del PDF: page { paddingTop: 122, paddingBottom: 96, paddingHorizontal: 72, fontSize: 10.5, lineHeight: 1.5 }
        padding: '122pt 72pt 96pt',
        fontFamily: "'Bookman Preview', 'Bookman Old Style', Georgia, serif",
        fontSize: '10.5pt',
        lineHeight: 1.5,
        color: '#0f172a',
      }}
    >
      <style>{FUENTE}</style>

      {/* Papel membretado en tres franjas recortadas de la misma imagen (sin repetir):
          encabezado arriba, marca de agua del centro una sola vez, y pie al final. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: '122pt', backgroundImage: "url('/membrete-kupocell.png')", backgroundSize: '612pt 792pt', backgroundPosition: '0 0' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{ top: '122pt', height: '574pt', backgroundImage: "url('/membrete-kupocell.png')", backgroundSize: '612pt 792pt', backgroundPosition: '0 -122pt' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: '96pt', backgroundImage: "url('/membrete-kupocell.png')", backgroundSize: '612pt 792pt', backgroundPosition: '0 -696pt' }}
      />

      <div className="relative">
        {/* Tabla encabezado — tablaEnc del PDF: borde 0.75pt #94a3b8 */}
        <div style={{ border: '0.75pt solid #94a3b8', marginBottom: '16pt' }}>
          <div style={{ padding: '8pt 6pt', textAlign: 'center', borderBottom: '0.75pt solid #94a3b8', backgroundColor: '#f8fafc' }}>
            <div style={{ fontSize: '12.5pt', fontWeight: 'bold', color: '#020617' }}>{r.titulo}</div>
            {r.numero ? <div style={{ fontSize: '9.5pt', color: '#1e293b', marginTop: '2pt' }}>No. {r.numero}</div> : null}
          </div>
          <div className="grid grid-cols-2" style={{ backgroundColor: '#f1f5f9', borderBottom: '0.5pt solid #94a3b8' }}>
            <div style={{ padding: '5pt', textAlign: 'center', fontWeight: 'bold', fontSize: '9pt', color: '#020617', borderRight: '0.5pt solid #cbd5e1' }}>CONTRATANTE</div>
            <div style={{ padding: '5pt', textAlign: 'center', fontWeight: 'bold', fontSize: '9pt', color: '#020617' }}>CONTRATISTA</div>
          </div>
          <div className="grid grid-cols-2">
            <div style={{ padding: '5pt', borderRight: '0.5pt solid #cbd5e1' }}>
              <Campo l="Nombre de la empresa" v={datos.empresa.razonSocial} primero />
              <Campo l="Representante legal" v={datos.empresa.representanteLegal} />
              <Campo l="NIT" v={datos.empresa.nit} />
              <Campo l="Dirección" v={datos.empresa.direccion} />
              <Campo l="Tipo de contrato" v="Prestación de servicios" />
              <Campo l="Valor total del contrato" v={c.valorTotal != null ? pesosALetras(c.valorTotal) : null} />
              <Campo l="Honorarios mensuales" v={c.honorarioMensual != null ? pesosALetras(c.honorarioMensual) : null} />
            </div>
            <div style={{ padding: '5pt' }}>
              <Campo l="Nombre" v={datos.contratista.nombre} primero />
              <Campo l="Identificación" v={datos.contratista.cc} />
              <Campo l="Dirección" v={datos.contratista.direccion} />
              <Campo l="E-mail" v={datos.contratista.email} />
              <Campo l="Plazo de ejecución" v={c.plazoMeses != null ? mesesALetras(c.plazoMeses) : null} />
              <Campo l="Fecha de suscripción" v={c.fechaSuscripcion ? fechaLarga(c.fechaSuscripcion) : null} />
              <Campo l="Fecha de terminación" v={c.fechaFin ? fechaLarga(c.fechaFin) : null} />
            </div>
          </div>
        </div>

        {/* intro del PDF: marginBottom 14pt, justificado */}
        <p style={{ marginBottom: '14pt', textAlign: 'justify' }}>{r.intro}</p>

        {r.clausulas.map((cl, i) => (
          <div key={i}>
            {/* clausulaTitulo: 10.5pt bold, mt 8pt mb 3pt */}
            <p style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#020617', marginTop: '8pt', marginBottom: '3pt' }}>{cl.titulo}</p>
            {cl.parrafos.map((p, j) => (
              <p key={j} style={{ marginBottom: '5pt', textAlign: 'justify' }}>{p}</p>
            ))}
            {cl.funciones && cl.funciones.length === 0 && (
              <p className="italic text-slate-400" style={{ textAlign: 'justify' }}>Selecciona un cargo con funciones para desplegarlas aquí.</p>
            )}
            {cl.funciones?.map((g, k) => (
              <div key={k}>
                <p style={{ fontWeight: 'bold', marginTop: '5pt', marginBottom: '2pt' }}>{g.grupo}</p>
                {g.items.map((it, m) => (
                  <div key={m} className="flex" style={{ marginBottom: '2pt', paddingLeft: '6pt' }}>
                    <span style={{ width: '10pt', flexShrink: 0 }}>•</span>
                    <span className="flex-1" style={{ textAlign: 'justify' }}>{it}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* cierre: mt 16pt, bold, justificado */}
        {r.cierre ? <p style={{ marginTop: '16pt', marginBottom: '4pt', textAlign: 'justify', fontWeight: 'bold' }}>{r.cierre}</p> : null}

        {/* firmas: mt 48pt, columnas 45%, línea #1e293b con mt 28pt */}
        <div className="flex justify-between" style={{ marginTop: '48pt' }}>
          <div style={{ width: '45%' }}>
            <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt', marginTop: '28pt' }}>
              <p style={{ fontWeight: 'bold' }}>EL CONTRATANTE</p>
              <p>{celda(datos.empresa.representanteLegal)}</p>
            </div>
          </div>
          <div style={{ width: '45%' }}>
            <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt', marginTop: '28pt' }}>
              <p style={{ fontWeight: 'bold' }}>{r.denominacionContratista ?? 'LA CONTRATISTA'}</p>
              <p>{celda(datos.contratista.nombre)}</p>
            </div>
          </div>
        </div>
      </div>
      {/* El encabezado, la marca de agua y el pie de contacto ya vienen impresos en la imagen del membrete. */}
    </div>
    </div>
  )
}

/** CampoEnc del PDF: label 8pt gris, valor 9pt con 3pt abajo; separador superior desde el segundo campo. */
function Campo({ l, v, primero }: { l: string; v?: string | null; primero?: boolean }) {
  return (
    <div style={primero ? undefined : { borderTop: '0.5pt solid #e2e8f0' }}>
      <div style={{ fontSize: '8pt', color: '#475569' }}>{l}</div>
      <div style={{ fontSize: '9pt', marginBottom: '3pt' }}>{celda(v)}</div>
    </div>
  )
}

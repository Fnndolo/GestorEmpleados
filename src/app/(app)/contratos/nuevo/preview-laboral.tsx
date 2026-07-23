'use client'

import { useEffect, useRef, useState } from 'react'
import { resolverPlantilla, type DatosContrato, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'
import { pesosALetras, mesesALetras, fechaLarga } from '@/lib/numero-letras'

type PlantillaBase = { titulo: string; intro: string; cierre?: string; clausulas: ClausulaPlantilla[] } | null

function celda(valor?: string | null) {
  return valor && valor.trim() ? valor : '__________'
}

/**
 * Vista previa del contrato LABORAL calcada del PDF real (src/server/pdf/contrato-laboral.tsx):
 * misma fuente, hoja carta con los mismos márgenes y estilos. Igual que la preview OPS,
 * la única diferencia con el PDF es la paginación (aquí corre continuo).
 */

const FUENTE = `
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-regular.ttf') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-bold.ttf') format('truetype'); font-weight: bold; font-style: normal; }
@font-face { font-family: 'Bookman Preview'; src: url('/fonts/bookman-italic.ttf') format('truetype'); font-weight: normal; font-style: italic; }
`

const ANCHO_HOJA_PX = 816

export function PreviewLaboral({
  plantilla,
  datos,
  funciones,
  tipoLabel,
}: {
  plantilla: PlantillaBase
  datos: DatosContrato
  funciones: FuncionesCargo | null
  tipoLabel: string
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
  })

  if (!plantilla) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
        No hay una plantilla activa para este tipo de contrato. El contrato se creará sin PDF
        (puedes sembrar la plantilla y regenerarlo después desde el detalle).
      </div>
    )
  }

  const r = resolverPlantilla(plantilla, datos, funciones)
  const c = datos.contrato

  return (
    <div ref={contenedor} className="overflow-hidden" style={{ height: altoEscalado }}>
    <div
      ref={hoja}
      className="relative bg-white shadow-sm ring-1 ring-slate-200"
      style={{
        transform: `scale(${escala})`,
        transformOrigin: 'top left',
        width: '612pt',
        minHeight: '792pt',
        padding: '122pt 72pt 96pt',
        fontFamily: "'Bookman Preview', 'Bookman Old Style', Georgia, serif",
        fontSize: '10.5pt',
        lineHeight: 1.5,
        color: '#1e293b',
      }}
    >
      <style>{FUENTE}</style>

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
        {/* Tabla de encabezado EMPLEADOR/EMPLEADO (recuadro de la página 1 del formato real) */}
        <div style={{ border: '0.75pt solid #94a3b8', marginBottom: '16pt' }}>
          <div style={{ padding: '8pt 6pt', textAlign: 'center', borderBottom: '0.75pt solid #94a3b8', backgroundColor: '#f8fafc' }}>
            <div style={{ fontSize: '12.5pt', fontWeight: 'bold', color: '#0f172a' }}>{r.titulo}</div>
            {r.numero && r.numero !== '__________' ? <div style={{ fontSize: '9.5pt', color: '#334155', marginTop: '2pt' }}>No. {r.numero}</div> : null}
          </div>
          <div className="grid grid-cols-2" style={{ backgroundColor: '#f1f5f9', borderBottom: '0.5pt solid #94a3b8' }}>
            <div style={{ padding: '5pt', textAlign: 'center', fontWeight: 'bold', fontSize: '9pt', color: '#0f172a', borderRight: '0.5pt solid #cbd5e1' }}>EMPLEADOR</div>
            <div style={{ padding: '5pt', textAlign: 'center', fontWeight: 'bold', fontSize: '9pt', color: '#0f172a' }}>EMPLEADO</div>
          </div>
          <div className="grid grid-cols-2">
            <div style={{ padding: '5pt', borderRight: '0.5pt solid #cbd5e1' }}>
              <Campo l="Nombre de la empresa" v={datos.empresa.razonSocial} primero />
              <Campo l="Rep. legal" v={datos.empresa.representanteLegal} />
              <Campo l="NIT" v={datos.empresa.nit} />
              <Campo l="Dirección" v={datos.empresa.direccion} />
              <Campo l="Tipo de contrato" v={tipoLabel} />
              <Campo l="Salario" v={c.salarioMensual != null && c.salarioMensual > 0 ? pesosALetras(c.salarioMensual) : null} />
              <Campo l="Auxilio de transporte" v={c.auxTransporte != null && c.auxTransporte > 0 ? pesosALetras(c.auxTransporte) : 'No aplica'} />
            </div>
            <div style={{ padding: '5pt' }}>
              <Campo l="Nombre" v={datos.contratista.nombre} primero />
              <Campo l="Identificación" v={datos.contratista.cc} />
              <Campo l="Dirección" v={datos.contratista.direccion} />
              <Campo l="E-mail" v={datos.contratista.email} />
              <Campo l="Duración del contrato" v={c.plazoMeses != null ? mesesALetras(c.plazoMeses) : c.fechaFin ? null : 'Indefinida'} />
              <Campo l="Fecha de iniciación de labores" v={c.fechaInicio ? fechaLarga(c.fechaInicio) : null} />
              <Campo l="Fecha que finaliza sus labores" v={c.fechaFin ? fechaLarga(c.fechaFin) : 'No aplica'} />
            </div>
          </div>
        </div>

        {r.intro.split('\n').map((p, i) => (
          <p key={i} style={{ marginBottom: '14pt', textAlign: 'justify' }}>{p}</p>
        ))}

        {r.clausulas.map((cl, i) => (
          <div key={i}>
            <p style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#0f172a', marginTop: '8pt', marginBottom: '3pt' }}>{cl.titulo}</p>
            {cl.parrafos.map((p, j) =>
              p.startsWith('- ') ? (
                <div key={j} className="flex" style={{ marginBottom: '2pt', paddingLeft: '6pt' }}>
                  <span style={{ width: '10pt', flexShrink: 0 }}>•</span>
                  <span className="flex-1" style={{ textAlign: 'justify' }}>{p.slice(2)}</span>
                </div>
              ) : (
                <p key={j} style={{ marginBottom: '5pt', textAlign: 'justify' }}>{p}</p>
              ),
            )}
            {cl.funciones && cl.funciones.length === 0 && (
              <p className="italic text-slate-400" style={{ textAlign: 'justify' }}>Selecciona un cargo con funciones para desplegarlas aquí.</p>
            )}
            {cl.funciones?.map((g, k) => (
              <div key={k}>
                {g.grupo ? <p style={{ fontWeight: 'bold', marginTop: '5pt', marginBottom: '2pt' }}>{g.grupo}</p> : null}
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

        {r.cierre ? <p style={{ marginTop: '16pt', marginBottom: '4pt', textAlign: 'justify', fontWeight: 'bold' }}>{r.cierre}</p> : null}

        <div className="flex justify-between" style={{ marginTop: '48pt' }}>
          <div style={{ width: '45%' }}>
            <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt', marginTop: '28pt' }}>
              <p style={{ fontWeight: 'bold' }}>EL EMPLEADOR:</p>
              <p>{celda(datos.empresa.razonSocial)}</p>
              <p style={{ fontSize: '8.5pt', color: '#334155' }}>{celda(datos.empresa.representanteLegal)} — Representante Legal</p>
            </div>
          </div>
          <div style={{ width: '45%' }}>
            <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt', marginTop: '28pt' }}>
              <p style={{ fontWeight: 'bold' }}>EL EMPLEADO:</p>
              <p>{celda(datos.contratista.nombre)}</p>
              <p style={{ fontSize: '8.5pt', color: '#334155' }}>CC. {celda(datos.contratista.cc)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function Campo({ l, v, primero }: { l: string; v?: string | null; primero?: boolean }) {
  return (
    <div style={primero ? undefined : { borderTop: '0.5pt solid #e2e8f0' }}>
      <div style={{ fontSize: '8pt', color: '#64748b' }}>{l}</div>
      <div style={{ fontSize: '9pt', marginBottom: '3pt' }}>{celda(v)}</div>
    </div>
  )
}

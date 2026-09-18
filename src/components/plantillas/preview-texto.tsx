'use client'

import { useMemo, type ReactNode } from 'react'
import { HojaCarta } from './hoja-carta'
import { conTablaImplicita, resolverTexto, type ClaveTexto, type EmpresaTexto, type PlantillaTexto } from '@/lib/plantillas-documento/textos'
import { muestraTexto, type TablaMuestra } from '@/lib/plantillas-documento/textos-muestra'
import type { Tramo } from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Vista previa de un texto editable (actas de Mis entregas, orden de pago de
 * horas extra, certificaciones) calcada de su PDF: misma hoja, márgenes,
 * fuente (Helvetica) y tamaños, con datos de muestra. Cambia al instante
 * mientras se edita. La hoja corre continua (no pagina); para el resultado
 * exacto está el PDF de muestra.
 */

const GRIS = '#64748b'
const PARRAFO: React.CSSProperties = { margin: '0 0 12pt', textAlign: 'justify' }

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

function Tabla({ t }: { t: TablaMuestra }) {
  if (t.tipo === 'pares') {
    return (
      <div style={{ margin: '8pt 0 12pt' }}>
        {t.pares.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '0.5pt solid #e2e8f0', padding: '3pt 0' }}>
            <span style={{ width: '40%', color: '#475569' }}>{k}</span>
            <span style={{ width: '60%' }}>{v}</span>
          </div>
        ))}
      </div>
    )
  }
  if (t.tipo === 'columnas') {
    return (
      <div style={{ margin: '8pt 0 12pt' }}>
        <div style={{ display: 'flex', borderBottom: '1pt solid #94a3b8', padding: '3pt 0', color: GRIS }}>
          {t.columnas.map((c) => <span key={c.titulo} style={{ width: c.ancho, textAlign: c.derecha ? 'right' : 'left' }}>{c.titulo}</span>)}
        </div>
        {t.filas.map((f, i) => (
          <div key={i} style={{ display: 'flex', borderBottom: '0.5pt solid #e2e8f0', padding: '3pt 0' }}>
            {f.map((v, j) => <span key={j} style={{ width: t.columnas[j].ancho, textAlign: t.columnas[j].derecha ? 'right' : 'left' }}>{v}</span>)}
          </div>
        ))}
        {t.total && (
          <div style={{ display: 'flex', padding: '3pt 0', fontWeight: 'bold' }}>
            <span style={{ width: '88%', textAlign: 'right' }}>Total</span>
            <span style={{ width: '12%', textAlign: 'right' }}>{t.total}</span>
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ margin: '18pt 0 16pt' }}>
      <div style={{ border: '0.75pt solid #94a3b8', borderRadius: '3pt', overflow: 'hidden', fontSize: '9pt' }}>
        <div style={{ display: 'flex', background: '#f1f5f9', fontWeight: 'bold', fontSize: '8.5pt', color: '#334155' }}>
          <span style={{ flex: 1, padding: '6pt' }}>Tipo de hora</span>
          <span style={{ flex: 1, padding: '6pt', textAlign: 'right' }}>Horas</span>
        </div>
        {t.filas.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', borderTop: '0.5pt solid #cbd5e1' }}>
            <span style={{ flex: 1, padding: '6pt' }}>{k}</span>
            <span style={{ flex: 1, padding: '6pt', textAlign: 'right' }}>{v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', borderTop: '0.5pt solid #cbd5e1', fontWeight: 'bold' }}>
          <span style={{ flex: 1, padding: '6pt' }}>Total horas extra</span>
          <span style={{ flex: 1, padding: '6pt', textAlign: 'right' }}>{t.totalHoras}</span>
        </div>
      </div>
      <div style={{ marginTop: '4pt', background: '#0f172a', color: '#fff', borderRadius: '3pt', padding: '10pt', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11pt' }}>
        <span>Total a pagar</span>
        <span>{t.totalPagar}</span>
      </div>
    </div>
  )
}

function CajaFirma({ ancho = '120pt', alto = '48pt' }: { ancho?: string; alto?: string }) {
  return (
    <div style={{ height: alto, width: ancho, border: '1px dashed #cbd5e1', borderRadius: '4pt', color: '#94a3b8', fontSize: '7.5pt', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2pt' }}>
      firma
    </div>
  )
}

export function PreviewTexto({
  clave, plantilla, variante, empresa, version,
}: {
  clave: ClaveTexto
  plantilla: PlantillaTexto
  variante: string
  empresa: EmpresaTexto & { direccion?: string | null; telefono?: string | null; emailContacto?: string | null }
  version?: number
}) {
  const m = useMemo(() => muestraTexto(clave, variante, empresa), [clave, variante, empresa])
  const r = useMemo(() => resolverTexto(plantilla, m.vars), [plantilla, m])
  const bloques = m.tabla ? conTablaImplicita(r.bloques) : r.bloques.filter((b) => b.tipo !== 'tabla')
  const fondo = m.fijos.cabecera === 'fondo'

  const cuerpo: ReactNode = bloques.map((b, i) => {
    if (b.tipo === 'tabla') return m.tabla ? <Tabla key={i} t={m.tabla} /> : null
    const p = b.parrafo
    return p.vineta ? (
      <div key={i} style={{ display: 'flex', paddingLeft: '14pt', marginBottom: '6pt' }}>
        <span style={{ width: '16pt', flexShrink: 0 }}>{p.vineta}</span>
        <p style={{ margin: 0, flex: 1, textAlign: 'justify' }}><Tramos tramos={p.tramos} /></p>
      </div>
    ) : (
      <p key={i} style={PARRAFO}><Tramos tramos={p.tramos} /></p>
    )
  })

  const firmas = m.fijos.firmas
  const firmaDoble = firmas.length > 1

  return (
    <HojaCarta membrete={fondo} fuente="helvetica" padding={fondo ? '122pt 56pt 80pt' : '48pt 56pt 64pt'} version={version}>
      {/* Alto mínimo de una hoja (792 − márgenes) para que el pie caiga abajo, como en el PDF. */}
      <div style={{ minHeight: fondo ? '590pt' : '680pt', display: 'flex', flexDirection: 'column' }}>
      {!fondo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2pt solid #0f172a', paddingBottom: '12pt', marginBottom: '24pt' }}>
          <div>
            <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#020617', lineHeight: 1.2 }}>{empresa.nombreComercial || empresa.razonSocial}</div>
            <div style={{ fontSize: '9pt', color: '#475569' }}>{empresa.razonSocial} · NIT {empresa.nit}</div>
          </div>
          <div style={{ fontSize: '8pt', color: '#475569', textAlign: 'right' }}>
            {empresa.direccion && <div>{empresa.direccion}</div>}
            {empresa.telefono && <div>Tel: {empresa.telefono}</div>}
            {empresa.emailContacto && <div>{empresa.emailContacto}</div>}
          </div>
        </div>
      )}

      <div style={{ fontSize: '14pt', fontWeight: 'bold', textAlign: 'center', color: '#020617', marginBottom: fondo ? '4pt' : '20pt' }}>
        {r.titulo.toUpperCase() || ' '}
      </div>
      {fondo && m.fijos.subtitulo && (
        <div style={{ fontSize: '9.5pt', textAlign: 'center', color: '#475569', marginBottom: '20pt' }}>{m.fijos.subtitulo}</div>
      )}
      {fondo && m.fijos.filas?.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5pt', fontSize: '10pt' }}>
          <span style={{ color: '#475569' }}>{k}</span>
          <span style={{ fontWeight: 'bold' }}>{v}</span>
        </div>
      ))}

      <div style={fondo ? { fontSize: '10pt' } : undefined}>{cuerpo}</div>

      {/* Firmas: dos columnas en las actas; una sola en certificaciones y orden de pago. */}
      <div style={{ display: 'flex', justifyContent: firmaDoble ? 'space-between' : 'flex-start', marginTop: fondo ? '40pt' : '48pt' }}>
        {firmas.map((f) => (
          <div key={f.nombre} style={{ width: '220pt' }}>
            {f.conFirma && <CajaFirma ancho={firmaDoble ? '120pt' : '150pt'} alto={firmaDoble ? '48pt' : '56pt'} />}
            <div style={{ borderTop: '1pt solid #1e293b', paddingTop: '4pt' }}>
              <div style={{ fontWeight: firmaDoble ? undefined : 'bold' }}>{f.nombre}</div>
              <div style={{ fontSize: '8pt', color: firmaDoble ? undefined : GRIS }}>{f.detalle}</div>
            </div>
          </div>
        ))}
      </div>

      {r.notas.map((n, i) => (
        <p key={i} style={{ margin: '18pt 0 0', fontSize: '8pt', color: GRIS, textAlign: 'center' }}><Tramos tramos={n} /></p>
      ))}

      {m.fijos.pie && (
        <div style={{ marginTop: 'auto', paddingTop: '24pt' }}>
          <div style={{ fontSize: '8pt', color: GRIS, borderTop: '1pt solid #e2e8f0', paddingTop: '8pt', textAlign: 'center' }}>{m.fijos.pie}</div>
        </div>
      )}
      </div>
    </HojaCarta>
  )
}

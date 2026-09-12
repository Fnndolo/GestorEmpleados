'use client'

import { HojaCarta } from './hoja-carta'
import { aplicarVariablesCuentaCobro, MUESTRA_CUENTA_COBRO, type VarsCuentaCobro } from '@/lib/plantillas-documento/cuenta-cobro'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaLarga, hoyBogota } from '@/lib/fechas'

const PARRAFO = { marginBottom: '10pt', textAlign: 'justify' as const, lineHeight: 1.6 }

/**
 * Vista previa de una plantilla de cuenta de cobro calcada del PDF
 * (src/server/pdf/cuenta-cobro.tsx), con datos de muestra. Cambia al instante
 * mientras se edita el texto.
 */
export function PreviewCuentaCobro({
  encabezado, cuerpo, pieLegal, logoUrl, empresa,
}: {
  encabezado: string
  cuerpo: string
  pieLegal: string
  logoUrl?: string | null
  empresa: { razonSocial: string; nit: string }
}) {
  const m = MUESTRA_CUENTA_COBRO
  const vars: VarsCuentaCobro = {
    contratista: m.contratista, documento: m.documento, valor: fmtCOP(m.valor), periodo: m.periodo,
    concepto: m.concepto, empresa: empresa.razonSocial, nit: empresa.nit, ciudad: m.ciudad,
  }
  const aplicar = (t: string) => aplicarVariablesCuentaCobro(t, vars)

  return (
    <HojaCarta membrete={false} padding="48pt 56pt 64pt" fuente="helvetica">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Logo de la plantilla" style={{ width: '120pt', marginBottom: '16pt', objectFit: 'contain' }} />
      )}
      <div style={{ fontSize: '15pt', fontWeight: 'bold', textAlign: 'center', marginBottom: '4pt' }}>CUENTA DE COBRO</div>
      <div style={{ fontSize: '10pt', textAlign: 'center', color: '#64748b', marginBottom: '18pt' }}>
        No. {m.numero} · {m.ciudad}, {formatFechaLarga(hoyBogota())}
      </div>

      {encabezado.trim() && <p style={PARRAFO}>{aplicar(encabezado)}</p>}

      <p style={PARRAFO}>
        <b>{empresa.razonSocial}</b> (NIT {empresa.nit}) debe a <b>{m.contratista}</b>, identificado(a) con {m.documento}, la suma de:
      </p>

      <div style={{ backgroundColor: '#f1f5f9', padding: '10pt', borderRadius: '4pt', margin: '12pt 0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>{m.concepto}</span>
        <span>{fmtCOP(m.valor)}</span>
      </div>

      <p style={PARRAFO}>{aplicar(cuerpo) || ' '}</p>

      <p style={PARRAFO}>Favor consignar a: {m.banco} {m.tipoCuenta} {m.numeroCuenta}.</p>

      {pieLegal.trim() && <p style={{ fontSize: '9pt', color: '#64748b', marginTop: '16pt' }}>{aplicar(pieLegal)}</p>}

      <div style={{ marginTop: '48pt' }}>
        <div style={{ borderTop: '1pt solid #1e293b', width: '220pt', paddingTop: '4pt' }}>
          <div style={{ fontWeight: 'bold' }}>{m.contratista}</div>
          <div>{m.documento}</div>
        </div>
      </div>
    </HojaCarta>
  )
}

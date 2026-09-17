import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaLarga } from '@/lib/fechas'

/**
 * Orden de pago de horas extra: en esta empresa se pagan APARTE de la nómina,
 * así que no hay desprendible que las cubra. Este PDF es el resumen que se
 * envía a quien paga (tesorería/banco) para llegar al total; el comprobante de
 * que ya se pagó es un documento aparte, que se sube después.
 */

const s = StyleSheet.create({
  page: { paddingTop: 122, paddingBottom: 80, paddingHorizontal: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  subtitulo: { fontSize: 9.5, textAlign: 'center', color: '#475569', marginBottom: 20 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  etiqueta: { color: '#475569' },
  negrita: { fontFamily: 'Helvetica-Bold' },
  tabla: { marginTop: 18, borderWidth: 0.75, borderColor: '#94a3b8', borderRadius: 3 },
  filaTabla: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1' },
  encTabla: { backgroundColor: '#f1f5f9' },
  celda: { flex: 1, padding: 6, fontSize: 9 },
  celdaEnc: { flex: 1, padding: 6, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#334155' },
  celdaDer: { textAlign: 'right' },
  totalBox: {
    marginTop: 4, backgroundColor: '#0f172a', borderRadius: 3, padding: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalTexto: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  banco: { marginTop: 16, fontSize: 9.5 },
  firma: { marginTop: 56, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, width: 220 },
})

const ETIQUETA_HORA: Record<string, string> = { HED: 'Diurna', HEN: 'Nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna' }

export type DatosOrdenPagoHorasExtra = {
  empresa: DatosEmpresa
  numero: string
  fecha: Date
  colaborador: { nombre: string; documento: string; banco: string | null; tipoCuenta: string | null; numeroCuenta: string | null }
  periodo: { desde: string; hasta: string }
  detalleHoras: Record<string, number>
  horasExtra: number
  valor: number
}

function Doc({ d, fondo }: { d: DatosOrdenPagoHorasExtra; fondo?: string }) {
  const codigos = Object.entries(d.detalleHoras).filter(([, h]) => h > 0)
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <MembreteFondo fondo={fondo} empresa={d.empresa} />

        <Text style={s.titulo}>ORDEN DE PAGO · HORAS EXTRA</Text>
        <Text style={s.subtitulo}>No. {d.numero} · {formatFechaLarga(d.fecha)}</Text>

        <View style={s.fila}>
          <Text style={s.etiqueta}>Colaborador</Text>
          <Text style={s.negrita}>{d.colaborador.nombre} · {d.colaborador.documento}</Text>
        </View>
        <View style={s.fila}>
          <Text style={s.etiqueta}>Período</Text>
          <Text style={s.negrita}>{formatFechaLarga(new Date(`${d.periodo.desde}T00:00:00.000Z`))} a {formatFechaLarga(new Date(`${d.periodo.hasta}T00:00:00.000Z`))}</Text>
        </View>

        <View style={s.tabla}>
          <View style={[s.filaTabla, s.encTabla]}>
            <Text style={s.celdaEnc}>Tipo de hora</Text>
            <Text style={[s.celdaEnc, s.celdaDer]}>Horas</Text>
          </View>
          {codigos.map(([c, h]) => (
            <View key={c} style={s.filaTabla}>
              <Text style={s.celda}>{ETIQUETA_HORA[c] ?? c}</Text>
              <Text style={[s.celda, s.celdaDer]}>{h.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h</Text>
            </View>
          ))}
          <View style={s.filaTabla}>
            <Text style={[s.celda, s.negrita]}>Total horas extra</Text>
            <Text style={[s.celda, s.celdaDer, s.negrita]}>{d.horasExtra.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h</Text>
          </View>
        </View>

        <View style={s.totalBox}>
          <Text style={s.totalTexto}>Total a pagar</Text>
          <Text style={s.totalTexto}>{fmtCOP(d.valor)}</Text>
        </View>

        {(d.colaborador.banco || d.colaborador.numeroCuenta) && (
          <Text style={s.banco}>
            Consignar a: {d.colaborador.banco ?? ''} {d.colaborador.tipoCuenta ?? ''} {d.colaborador.numeroCuenta ?? ''}.
          </Text>
        )}

        <View style={s.firma}>
          <Text style={s.negrita}>{d.colaborador.nombre}</Text>
          <Text style={{ fontSize: 8.5, color: '#64748b' }}>{d.colaborador.documento}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderOrdenPagoHorasExtra(d: DatosOrdenPagoHorasExtra, fondo?: string): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} fondo={fondo} />)
}

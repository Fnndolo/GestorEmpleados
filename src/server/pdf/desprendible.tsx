import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { Membrete, type DatosEmpresa } from './membrete'
import { estilos } from './estilos'
import { fmtCOP } from '@/lib/moneda'

const s = StyleSheet.create({
  encabezado: { backgroundColor: '#f1f5f9', padding: 8, marginBottom: 12, borderRadius: 4 },
  grid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  seccionTitulo: { fontSize: 10, fontFamily: 'Helvetica-Bold', backgroundColor: '#0f172a', color: '#fff', padding: 4, marginTop: 8 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 2.5 },
  concepto: { width: '60%', fontSize: 9 },
  cantidad: { width: '15%', fontSize: 9, textAlign: 'right' },
  valor: { width: '25%', fontSize: 9, textAlign: 'right' },
  totalFila: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#0f172a', marginTop: 2 },
  totalLabel: { width: '75%', fontSize: 10, fontFamily: 'Helvetica-Bold' },
  totalValor: { width: '25%', fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  neto: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ecfdf5', padding: 8, marginTop: 12, borderRadius: 4 },
})

export type DatosDesprendible = {
  empresa: DatosEmpresa
  periodo: string
  colaborador: { nombre: string; documento: string; cargo: string | null; sede: string }
  diasTrabajados: number
  ibc: number
  lineas: { codigo: string; nombre: string; tipo: string; cantidad?: number | null; valor: number }[]
  totalDevengado: number
  totalDeducido: number
  neto: number
}

function Doc({ d }: { d: DatosDesprendible }) {
  const devengados = d.lineas.filter((l) => l.tipo === 'DEVENGADO')
  const deducciones = d.lineas.filter((l) => l.tipo === 'DEDUCCION')

  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>DESPRENDIBLE DE PAGO DE NÓMINA</Text>

        <View style={s.encabezado}>
          <View style={s.grid}><Text>Colaborador: {d.colaborador.nombre}</Text><Text>Periodo: {d.periodo}</Text></View>
          <View style={s.grid}><Text>Documento: {d.colaborador.documento}</Text><Text>Días: {d.diasTrabajados}</Text></View>
          <View style={s.grid}><Text>Cargo: {d.colaborador.cargo ?? '—'}</Text><Text>Sede: {d.colaborador.sede}</Text></View>
        </View>

        <Text style={s.seccionTitulo}>DEVENGADOS</Text>
        {devengados.map((l, i) => (
          <View key={i} style={s.fila}>
            <Text style={s.concepto}>{l.nombre}</Text>
            <Text style={s.cantidad}>{l.cantidad ?? ''}</Text>
            <Text style={s.valor}>{fmtCOP(l.valor)}</Text>
          </View>
        ))}
        <View style={s.totalFila}><Text style={s.totalLabel}>Total devengado</Text><Text style={s.totalValor}>{fmtCOP(d.totalDevengado)}</Text></View>

        <Text style={s.seccionTitulo}>DEDUCCIONES</Text>
        {deducciones.map((l, i) => (
          <View key={i} style={s.fila}>
            <Text style={s.concepto}>{l.nombre}</Text>
            <Text style={s.cantidad}></Text>
            <Text style={s.valor}>{fmtCOP(l.valor)}</Text>
          </View>
        ))}
        <View style={s.totalFila}><Text style={s.totalLabel}>Total deducido</Text><Text style={s.totalValor}>{fmtCOP(d.totalDeducido)}</Text></View>

        <View style={s.neto}>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>NETO A PAGAR</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>{fmtCOP(d.neto)}</Text>
        </View>

        <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 8 }}>IBC seguridad social: {fmtCOP(d.ibc)}</Text>
        <Text style={estilos.pie} fixed>{d.empresa.razonSocial} · NIT {d.empresa.nit} · Documento generado electrónicamente</Text>
      </Page>
    </Document>
  )
}

export async function renderDesprendible(d: DatosDesprendible): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

import { Document, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { DatosEmpresa } from './membrete'
import { estilos } from './estilos'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesDesprendible, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { fmtCOP } from '@/lib/moneda'

/**
 * Desprendible de pago de nómina. El título y el texto alrededor de la tabla se
 * editan en Ajustes → Plantillas de documentos (clave DESPRENDIBLE_NOMINA), y
 * ahí mismo se elige si va sobre el papel membretado; el encabezado del
 * colaborador, los devengados, las deducciones, el neto y el IBC los pone la app.
 */

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

/** Lo que pone la app: encabezado del colaborador, devengados, deducciones, neto e IBC. */
function Tablas({ d }: { d: DatosDesprendible }) {
  const devengados = d.lineas.filter((l) => l.tipo === 'DEVENGADO')
  const deducciones = d.lineas.filter((l) => l.tipo === 'DEDUCCION')
  return (
    <View>
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
      <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 8, marginBottom: 8 }}>IBC seguridad social: {fmtCOP(d.ibc)}</Text>
    </View>
  )
}

function Doc({ d, texto, membrete, fondo }: { d: DatosDesprendible; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit} · Documento generado electrónicamente`}>
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={<Tablas d={d} />} />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

/**
 * Renderiza el desprendible con el texto vigente de Ajustes, salvo que se pase
 * `plantilla` (muestras). El membrete propio se resuelve solo si el texto lo usa.
 */
export async function renderDesprendible(d: DatosDesprendible, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('DESPRENDIBLE_NOMINA'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesDesprendible(d))} membrete={texto.usaMembrete} fondo={fondo} />)
}

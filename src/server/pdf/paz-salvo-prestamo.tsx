import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaLarga } from '@/lib/fechas'

const s = StyleSheet.create({
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 10, textAlign: 'center', color: '#64748b', marginBottom: 18 },
  parrafo: { marginBottom: 10, textAlign: 'justify', lineHeight: 1.6 },
  box: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 4, marginVertical: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
})

export type DatosPazSalvoPrestamo = {
  empresa: { razonSocial: string; nit: string }
  colaborador: { nombre: string; documento: string }
  valorTotal: number
  numeroCuotas: number
  descripcion: string | null
  fechaInicio: Date
  ciudad: string
  fecha: Date
}

function Doc({ d }: { d: DatosPazSalvoPrestamo }) {
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Text style={s.titulo}>PAZ Y SALVO DE PRÉSTAMO</Text>
        <Text style={s.sub}>{d.ciudad}, {formatFechaLarga(d.fecha)}</Text>

        <Text style={s.parrafo}>
          <Text style={estilos.negrita}>{d.empresa.razonSocial}</Text> (NIT {d.empresa.nit}) hace constar que{' '}
          <Text style={estilos.negrita}>{d.colaborador.nombre}</Text>, identificado(a) con {d.colaborador.documento},
          ha <Text style={estilos.negrita}>cancelado en su totalidad</Text> el préstamo otorgado por la empresa,
          según el siguiente detalle:
        </Text>

        <View style={s.box}>
          <View style={s.fila}><Text>Valor del préstamo</Text><Text style={estilos.negrita}>{fmtCOP(d.valorTotal)}</Text></View>
          <View style={s.fila}><Text>Número de cuotas</Text><Text>{d.numeroCuotas}</Text></View>
          <View style={s.fila}><Text>Fecha de inicio</Text><Text>{formatFechaLarga(d.fechaInicio)}</Text></View>
          {d.descripcion ? <View style={s.fila}><Text>Concepto</Text><Text>{d.descripcion}</Text></View> : null}
          <View style={s.fila}><Text>Saldo pendiente</Text><Text style={estilos.negrita}>{fmtCOP(0)}</Text></View>
        </View>

        <Text style={s.parrafo}>
          En consecuencia, el(la) colaborador(a) se encuentra a paz y salvo con la empresa por concepto de este
          préstamo, sin que exista saldo alguno a cargo.
        </Text>

        <View style={{ marginTop: 60 }}>
          <View style={estilos.firmaLinea}>
            <Text style={estilos.negrita}>{d.empresa.razonSocial}</Text>
            <Text>NIT {d.empresa.nit}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderPazSalvoPrestamo(d: DatosPazSalvoPrestamo): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

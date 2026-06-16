import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaLarga } from '@/lib/fechas'

const s = StyleSheet.create({
  logo: { width: 120, marginBottom: 16, objectFit: 'contain' },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  numero: { fontSize: 10, textAlign: 'center', color: '#64748b', marginBottom: 18 },
  parrafo: { marginBottom: 10, textAlign: 'justify', lineHeight: 1.6 },
  valorBox: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 4, marginVertical: 12, flexDirection: 'row', justifyContent: 'space-between' },
  pie: { fontSize: 9, color: '#64748b', marginTop: 16 },
})

export type DatosCuentaCobro = {
  empresa: { razonSocial: string; nombreComercial: string; nit: string; direccion?: string | null }
  contratista: { nombre: string; documento: string; rut: string | null; banco: string | null; tipoCuenta: string | null; numeroCuenta: string | null }
  plantilla: { encabezado: string | null; cuerpo: string; pieLegal: string | null; logoDataUri: string | null }
  numero: string
  periodo: string
  concepto: string | null
  valor: number
  ciudad: string
  fecha: Date
}

function aplicarVariables(texto: string, d: DatosCuentaCobro): string {
  return texto
    .replace(/\{\{\s*contratista\s*\}\}/gi, d.contratista.nombre)
    .replace(/\{\{\s*documento\s*\}\}/gi, d.contratista.documento)
    .replace(/\{\{\s*valor\s*\}\}/gi, fmtCOP(d.valor))
    .replace(/\{\{\s*periodo\s*\}\}/gi, d.periodo)
    .replace(/\{\{\s*concepto\s*\}\}/gi, d.concepto ?? '')
    .replace(/\{\{\s*empresa\s*\}\}/gi, d.empresa.razonSocial)
    .replace(/\{\{\s*nit\s*\}\}/gi, d.empresa.nit)
    .replace(/\{\{\s*ciudad\s*\}\}/gi, d.ciudad)
}

function Doc({ d }: { d: DatosCuentaCobro }) {
  const cuerpo = aplicarVariables(d.plantilla.cuerpo, d)
  const encabezado = d.plantilla.encabezado ? aplicarVariables(d.plantilla.encabezado, d) : null
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        {d.plantilla.logoDataUri ? <Image src={d.plantilla.logoDataUri} style={s.logo} /> : null}
        <Text style={s.titulo}>CUENTA DE COBRO</Text>
        <Text style={s.numero}>No. {d.numero} · {d.ciudad}, {formatFechaLarga(d.fecha)}</Text>

        {encabezado ? <Text style={s.parrafo}>{encabezado}</Text> : null}

        <Text style={s.parrafo}>
          <Text style={estilos.negrita}>{d.empresa.razonSocial}</Text> (NIT {d.empresa.nit}) debe a{' '}
          <Text style={estilos.negrita}>{d.contratista.nombre}</Text>, identificado(a) con {d.contratista.documento}
          {d.contratista.rut ? `, RUT ${d.contratista.rut}` : ''}, la suma de:
        </Text>

        <View style={s.valorBox}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{d.concepto ?? `Periodo ${d.periodo}`}</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtCOP(d.valor)}</Text>
        </View>

        <Text style={s.parrafo}>{cuerpo}</Text>

        {(d.contratista.banco || d.contratista.numeroCuenta) ? (
          <Text style={s.parrafo}>
            Favor consignar a: {d.contratista.banco ?? ''} {d.contratista.tipoCuenta ?? ''} {d.contratista.numeroCuenta ?? ''}.
          </Text>
        ) : null}

        {d.plantilla.pieLegal ? <Text style={s.pie}>{aplicarVariables(d.plantilla.pieLegal, d)}</Text> : null}

        <View style={{ marginTop: 48 }}>
          <View style={estilos.firmaLinea}>
            <Text style={estilos.negrita}>{d.contratista.nombre}</Text>
            <Text>{d.contratista.documento}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderCuentaCobro(d: DatosCuentaCobro): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { formatFechaLarga } from '@/lib/fechas'

export type DatosActaDotacion = {
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  anio: number
  corte: string // Abril | Agosto | Diciembre
  items: string
  ciudad: string
  fecha: Date
  /** Firma digital del colaborador (data URI PNG); si falta, queda la línea para firmar. */
  firmaDataUri?: string | null
  firmaFecha?: Date | null
}

function Doc({ d }: { d: DatosActaDotacion }) {
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>RECIBIDO DE DOTACIÓN — {d.corte.toUpperCase()} {d.anio}</Text>
        <Text style={estilos.parrafo}>
          En {d.ciudad}, a los {formatFechaLarga(d.fecha)}, el(la) señor(a){' '}
          <Text style={estilos.negrita}>{d.colaborador.nombre}</Text>, identificado(a) con documento{' '}
          {d.colaborador.documento}{d.colaborador.cargo ? `, en su cargo de ${d.colaborador.cargo},` : ','}{' '}
          declara haber recibido de {d.empresa.nombreComercial} la dotación de vestido y calzado de labor
          correspondiente al corte de {d.corte} de {d.anio}, conforme a los artículos 230 a 234 del
          Código Sustantivo del Trabajo:
        </Text>
        <View style={estilos.tabla}>
          <View style={estilos.fila}>
            <Text style={estilos.celdaLabel}>Elementos entregados</Text>
            <Text style={estilos.celdaValor}>{d.items}</Text>
          </View>
        </View>
        <Text style={estilos.parrafo}>
          El colaborador manifiesta que la dotación fue recibida a satisfacción y se compromete a
          usarla en el desempeño de sus funciones (art. 233 CST).
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 }}>
          <View style={estilos.firmaLinea}>
            {d.firmaDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={d.firmaDataUri} style={{ width: 120, height: 48, objectFit: 'contain' }} />
            ) : null}
            <Text>{d.colaborador.nombre}</Text>
            <Text style={{ fontSize: 8 }}>
              Colaborador{d.firmaDataUri && d.firmaFecha ? ` · firmado digitalmente el ${formatFechaLarga(d.firmaFecha)}` : ''}
            </Text>
          </View>
          <View style={estilos.firmaLinea}><Text>Talento Humano</Text><Text style={{ fontSize: 8 }}>{d.empresa.nombreComercial}</Text></View>
        </View>
        <Pie texto={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} />
      </Page>
    </Document>
  )
}

export async function renderActaDotacion(d: DatosActaDotacion): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

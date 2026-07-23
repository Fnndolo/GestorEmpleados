import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { formatFechaLarga } from '@/lib/fechas'

export type DatosActaEpp = {
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  elemento: string
  cantidad: number
  reposicion: boolean
  ciudad: string
  fecha: Date
  /** Firma digital del colaborador (data URI PNG); si falta, queda la línea para firmar. */
  firmaDataUri?: string | null
  firmaFecha?: Date | null
}

function Doc({ d }: { d: DatosActaEpp }) {
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>CONSTANCIA DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL</Text>
        <Text style={estilos.parrafo}>
          En {d.ciudad}, a los {formatFechaLarga(d.fecha)}, el(la) señor(a){' '}
          <Text style={estilos.negrita}>{d.colaborador.nombre}</Text>, identificado(a) con documento{' '}
          {d.colaborador.documento}{d.colaborador.cargo ? `, en su cargo de ${d.colaborador.cargo},` : ','}{' '}
          recibe de {d.empresa.nombreComercial} los siguientes elementos de protección personal
          (Decreto 1072 de 2015, art. 2.2.4.6.24):
        </Text>
        <View style={estilos.tabla}>
          <Fila k="Elemento" v={d.elemento} />
          <Fila k="Cantidad" v={String(d.cantidad)} />
          <Fila k="Tipo de entrega" v={d.reposicion ? 'Reposición' : 'Entrega inicial'} />
        </View>
        <Text style={estilos.parrafo}>
          El colaborador declara haber recibido los elementos en buen estado y se compromete a usarlos
          durante la ejecución de sus labores, cuidarlos y solicitar su reposición cuando se deterioren
          (Ley 9 de 1979, art. 88; Resolución 2400 de 1979).
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 56 }}>
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
          <View style={estilos.firmaLinea}><Text>Responsable SST</Text><Text style={{ fontSize: 8 }}>{d.empresa.nombreComercial}</Text></View>
        </View>
        <Pie texto={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} />
      </Page>
    </Document>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.celdaLabel}>{k}</Text>
      <Text style={estilos.celdaValor}>{v}</Text>
    </View>
  )
}

export async function renderActaEpp(d: DatosActaEpp): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'

export type DatosActaActivo = {
  tipo: 'entrega' | 'devolucion'
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  activo: { codigo: string; nombre: string; tipo: string; marca: string | null; serie: string | null; valor: number | null }
  ciudad: string
  fecha: Date
  /** Firma digital del colaborador (data URI PNG); si falta, queda la línea para firmar. */
  firmaDataUri?: string | null
  firmaFecha?: Date | null
}

function Doc({ d }: { d: DatosActaActivo }) {
  const titulo = d.tipo === 'entrega' ? 'ACTA DE ENTREGA DE ACTIVO' : 'ACTA DE DEVOLUCIÓN DE ACTIVO'
  const verbo = d.tipo === 'entrega' ? 'recibe' : 'devuelve'
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.parrafo}>
          En {d.ciudad}, a los {formatFechaLarga(d.fecha)}, el(la) señor(a){' '}
          <Text style={estilos.negrita}>{d.colaborador.nombre}</Text>, identificado(a) con documento{' '}
          {d.colaborador.documento}{d.colaborador.cargo ? `, en su cargo de ${d.colaborador.cargo},` : ','}{' '}
          {verbo} el siguiente activo de propiedad de {d.empresa.nombreComercial}:
        </Text>
        <View style={estilos.tabla}>
          <Fila k="Código" v={d.activo.codigo} />
          <Fila k="Activo" v={d.activo.nombre} />
          <Fila k="Tipo" v={d.activo.tipo} />
          {d.activo.marca ? <Fila k="Marca" v={d.activo.marca} /> : null}
          {d.activo.serie ? <Fila k="Serie" v={d.activo.serie} /> : null}
          {d.activo.valor != null ? <Fila k="Valor" v={fmtCOP(d.activo.valor)} /> : null}
        </View>
        <Text style={estilos.parrafo}>
          {d.tipo === 'entrega'
            ? 'El colaborador se compromete a custodiar, usar adecuadamente y devolver el activo en buen estado al finalizar la relación laboral o cuando la empresa lo requiera.'
            : 'Se deja constancia de la devolución del activo en las condiciones verificadas por la empresa.'}
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
          <View style={estilos.firmaLinea}><Text>Talento Humano</Text><Text style={{ fontSize: 8 }}>{d.empresa.nombreComercial}</Text></View>
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

export async function renderActaActivo(d: DatosActaActivo): Promise<Buffer> {
  return renderToBuffer(<Doc d={d} />)
}

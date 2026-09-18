import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { BloquesPdf, NotasPdf } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesActaEpp, type PlantillaTexto, type TextoResuelto } from '@/lib/plantillas-documento/textos'
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

/**
 * El texto viene de Ajustes → Plantillas de documentos (clave ACTA_EPP); aquí
 * solo se pone la hoja: membrete, tabla del elemento, firmas y pie.
 */
function Doc({ d, texto }: { d: DatosActaEpp; texto: TextoResuelto }) {
  const tabla = (
    <View style={estilos.tabla}>
      <Fila k="Elemento" v={d.elemento} />
      <Fila k="Cantidad" v={String(d.cantidad)} />
      <Fila k="Tipo de entrega" v={d.reposicion ? 'Reposición' : 'Entrega inicial'} />
    </View>
  )
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={tabla} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 56 }} wrap={false}>
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
        <NotasPdf notas={texto.notas} />
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

/** Renderiza la constancia con el texto vigente de Ajustes, salvo que se pase `plantilla` (muestras). */
export async function renderActaEpp(d: DatosActaEpp, plantilla?: PlantillaTexto): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('ACTA_EPP'))
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesActaEpp(d))} />)
}

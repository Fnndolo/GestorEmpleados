import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { BloquesPdf, NotasPdf } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesActaDotacion, type PlantillaTexto, type TextoResuelto } from '@/lib/plantillas-documento/textos'
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

/**
 * El texto viene de Ajustes → Plantillas de documentos (clave ACTA_DOTACION);
 * aquí solo se pone la hoja: membrete, tabla de elementos, firmas y pie.
 */
function Doc({ d, texto }: { d: DatosActaDotacion; texto: TextoResuelto }) {
  const tabla = (
    <View style={estilos.tabla}>
      <View style={estilos.fila}>
        <Text style={estilos.celdaLabel}>Elementos entregados</Text>
        <Text style={estilos.celdaValor}>{d.items}</Text>
      </View>
    </View>
  )
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={tabla} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 }} wrap={false}>
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
        <NotasPdf notas={texto.notas} />
        <Pie texto={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} />
      </Page>
    </Document>
  )
}

/** Renderiza el recibido con el texto vigente de Ajustes, salvo que se pase `plantilla` (muestras). */
export async function renderActaDotacion(d: DatosActaDotacion, plantilla?: PlantillaTexto): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('ACTA_DOTACION'))
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesActaDotacion(d))} />)
}

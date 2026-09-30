import { Document, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesCuentaCobro, type DatosVarsCuentaCobro, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { lineasFirmaCuentaCobro } from '@/lib/plantillas-documento/textos-muestra'

export type DatosCuentaCobro = DatosVarsCuentaCobro & {
  empresa: DatosEmpresa & DatosVarsCuentaCobro['empresa']
  /** Firma del contratista (acreedor), si ya firmó. */
  firmaDataUri?: string | null
}

/** La firma del acreedor, donde el texto dice `[firma]`: el trazo, la raya y sus datos. */
function FirmaAcreedor({ lineas, firmaDataUri }: { lineas: string[]; firmaDataUri: string | null }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 12, width: 320 }} wrap={false}>
      {firmaDataUri
        ? <Image src={firmaDataUri} style={{ width: 150, height: 56, objectFit: 'contain', marginBottom: -4 }} />
        : <View style={{ height: 52 }} />}
      <View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4 }}>
        {lineas.map((l) => <Text key={l}>{l}</Text>)}
      </View>
    </View>
  )
}

/**
 * Cuenta de cobro: todo el texto viene de Ajustes → Plantillas de documentos
 * (clave CUENTA_COBRO); aquí solo va la hoja y la firma del contratista en el
 * sitio de `[firma]`. Es un documento del contratista, así que sin membrete va
 * en hoja limpia, sin el encabezado de la empresa.
 */
function Doc({ d, texto, membrete, fondo, vars }: { d: DatosCuentaCobro; texto: TextoResuelto; membrete: boolean; fondo?: string; vars: Record<string, string> }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie="" sinEncabezado estilo={{ fontSize: 10.5 }}>
        <Text style={[estilos.titulo, { marginBottom: 14 }]}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf
          bloques={texto.bloques}
          compacto
          tabla={<FirmaAcreedor lineas={lineasFirmaCuentaCobro(vars)} firmaDataUri={d.firmaDataUri ?? null} />}
        />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

export async function renderCuentaCobro(d: DatosCuentaCobro, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('CUENTA_COBRO'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  const vars = variablesCuentaCobro(d)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, vars)} membrete={texto.usaMembrete} fondo={fondo} vars={vars} />)
}

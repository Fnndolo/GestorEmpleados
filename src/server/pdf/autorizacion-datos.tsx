import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { fondoMembrete } from './fondo-membrete'
import { registrarBookman } from './fuentes'
import { plantillaAutorizacionDatos } from '@/server/plantillas-documento'
import {
  resolverAutorizacion, rolFirmaAutorizacion, type Parrafo, type PlantillaAutorizacion,
} from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Autorización expresa para el tratamiento de datos personales (Ley 1581 de
 * 2012). Se genera junto con el contrato (OPS o laboral) y SOLO la firma la
 * persona vinculada.
 *
 * El TEXTO ya no vive aquí: lo edita la empresa en Ajustes → Plantillas de
 * documentos (`PlantillaDocumento`, categoría AUTORIZACION_DATOS) y, si nadie lo
 * ha tocado, se usa el de fábrica de `src/lib/plantillas-documento/autorizacion-datos.ts`.
 * Este archivo solo pone la hoja: membrete, fecha, título, párrafos y firma.
 */

export type DatosAutorizacionPdf = {
  ciudadFecha: string // "Pasto, Nariño, diez (10) de julio de 2026."
  contratistaNombre: string
  contratistaCc: string // "1.086.298.085 DE FUNES (N)" — número + lugar
  cargo: string // "OPERADOR CALL CENTER"
  genero?: string | null // 'MASCULINO' ajusta identificado/informado
  /** OPS = contratista independiente (por defecto, como en los contratos viejos); LABORAL = trabajador. */
  vinculo?: 'OPS' | 'LABORAL'
  empresa: DatosEmpresa & { domicilio: string } // domicilio: "Pasto, Nariño, Calle 16 # 23-71, Centro"
}

const s = StyleSheet.create({
  page: { paddingTop: 122, paddingBottom: 96, paddingHorizontal: 72, fontFamily: 'Bookman Old Style' },
  // Espacios fijos compactos: con el texto de fábrica, el documento FIRMADO (con
  // la imagen de la firma y su línea de fecha) debe caber en una hoja; antes la
  // firma se iba sola a la segunda página por unos pocos puntos. La vista previa
  // (preview-autorizacion.tsx) usa estos mismos valores: si cambian aquí, allá.
  fecha: { marginBottom: 12 },
  negrita: { fontFamily: 'Bookman Old Style', fontWeight: 'bold' },
  titulo: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 11.5, textAlign: 'center', color: '#0f172a' },
  subtitulo: { fontSize: 10, textAlign: 'center', marginBottom: 12 },
  parrafo: { marginBottom: 10, textAlign: 'justify' },
  subrayado: { textDecoration: 'underline' },
  firmaBloque: { marginTop: 16 },
  // La imagen ocupa 44pt netos (56 − 12), igual que el espacio en blanco sin firma.
  firmaImg: { width: 160, height: 56, objectFit: 'contain', alignSelf: 'flex-start', marginBottom: -12 },
  firmaEspacio: { height: 44 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, width: '62%' },
  firmaFecha: { fontSize: 7.5, color: '#64748b', marginTop: 2 },
})

function DocumentoAutorizacion({
  d, titulo, parrafos, firmaImg, firmaFecha, fondo,
}: {
  d: DatosAutorizacionPdf
  titulo: string
  parrafos: Parrafo[]
  firmaImg?: string | null
  firmaFecha?: string | null
  fondo?: string
}) {
  return (
    <Document>
      <Page size="LETTER" style={[estilos.page, s.page]}>
        <MembreteFondo fondo={fondo} empresa={d.empresa} />

        <Text style={s.fecha}>{d.ciudadFecha}</Text>

        <Text style={s.titulo}>{titulo}</Text>
        <Text style={s.subtitulo}>{d.empresa.razonSocial} - NIT No. {d.empresa.nit}</Text>

        {parrafos.map((p, i) => (
          <Text key={i} style={s.parrafo}>
            {p.map((t, j) => (
              <Text key={j} style={[t.negrita ? s.negrita : {}, t.subrayado ? s.subrayado : {}]}>{t.texto}</Text>
            ))}
          </Text>
        ))}

        <View style={s.firmaBloque} wrap={false}>
          {firmaImg ? <Image src={firmaImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
          <View style={s.firmaLinea}>
            <Text style={s.negrita}>{d.contratistaNombre}</Text>
            <Text>CC. {d.contratistaCc}</Text>
            <Text>{rolFirmaAutorizacion(d.vinculo)} {d.cargo}</Text>
            {firmaFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {firmaFecha}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}

/**
 * Renderiza la autorización (con o sin firma). Toma el texto vigente de Ajustes,
 * salvo que se pase `plantilla` (por ejemplo, para una muestra sin guardar).
 */
export async function renderAutorizacionDatos(
  d: DatosAutorizacionPdf,
  firmaImg?: string | null,
  firmaFecha?: string | null,
  plantilla?: PlantillaAutorizacion,
): Promise<Buffer> {
  registrarBookman()
  // El membrete puede venir de Ajustes; si no hay uno propio, `fondo` queda
  // indefinido y se usa el de fábrica, que ya trae el pie impreso.
  const { src, propio } = await fondoMembrete()
  const fondo = propio ? src : undefined
  const texto = plantilla ?? (await plantillaAutorizacionDatos())
  const r = resolverAutorizacion(texto, {
    ciudadFecha: d.ciudadFecha,
    nombre: d.contratistaNombre,
    cedula: d.contratistaCc,
    cargo: d.cargo,
    genero: d.genero,
    vinculo: d.vinculo,
    empresa: { razonSocial: d.empresa.razonSocial, nit: d.empresa.nit, domicilio: d.empresa.domicilio, emailContacto: d.empresa.emailContacto },
  })
  return renderToBuffer(
    <DocumentoAutorizacion d={d} titulo={r.titulo} parrafos={r.parrafos} firmaImg={firmaImg} firmaFecha={firmaFecha} fondo={fondo} />,
  )
}

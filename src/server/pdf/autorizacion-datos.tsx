import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { registrarBookman } from './fuentes'

/**
 * Autorización expresa para el tratamiento de datos personales (Ley 1581 de
 * 2012), basada en el formato real de KUPOCELL. Se genera junto con el contrato
 * OPS y SOLO la firma el contratista.
 */

// Correo del canal PQRS/ARCO (formato oficial de la empresa).
const CORREO_ARCO = 'pqrsmaskuposas@gmail.com'

export type DatosAutorizacionPdf = {
  ciudadFecha: string // "Pasto, Nariño, diez (10) de julio de 2026."
  contratistaNombre: string
  contratistaCc: string // "1.086.298.085 DE FUNES (N)" — número + lugar
  cargo: string // "OPERADOR CALL CENTER"
  genero?: string | null // 'MASCULINO' ajusta identificado/informado
  empresa: DatosEmpresa & { domicilio: string } // domicilio: "Pasto, Nariño, Calle 16 # 23-71, Centro"
}

const s = StyleSheet.create({
  page: { paddingTop: 122, paddingBottom: 96, paddingHorizontal: 72, fontFamily: 'Bookman Old Style' },
  fecha: { marginBottom: 16 },
  negrita: { fontFamily: 'Bookman Old Style', fontWeight: 'bold' },
  titulo: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 11.5, textAlign: 'center', color: '#0f172a' },
  subtitulo: { fontSize: 10, textAlign: 'center', marginBottom: 16 },
  parrafo: { marginBottom: 10, textAlign: 'justify' },
  subrayado: { textDecoration: 'underline' },
  firmaBloque: { marginTop: 40 },
  firmaImg: { width: 160, height: 56, objectFit: 'contain', alignSelf: 'flex-start', marginBottom: -6 },
  firmaEspacio: { height: 50 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, width: '62%' },
  firmaFecha: { fontSize: 7.5, color: '#64748b', marginTop: 2 },
})

function DocumentoAutorizacion({ d, firmaImg, firmaFecha }: { d: DatosAutorizacionPdf; firmaImg?: string | null; firmaFecha?: string | null }) {
  const masc = d.genero === 'MASCULINO'
  const identificado = masc ? 'identificado' : 'identificada'
  const informado = masc ? 'informado' : 'informada'
  return (
    <Document>
      <Page size="LETTER" style={[estilos.page, s.page]}>
        <MembreteFondo />

        <Text style={s.fecha}>{d.ciudadFecha}</Text>

        <Text style={s.titulo}>AUTORIZACIÓN EXPRESA PARA EL TRATAMIENTO DE DATOS PERSONALES</Text>
        <Text style={s.subtitulo}>{d.empresa.razonSocial} - NIT No. {d.empresa.nit}</Text>

        <Text style={s.parrafo}>
          Yo, {d.contratistaNombre}, {identificado} con cédula de ciudadanía No. {d.contratistaCc} en calidad de:
          CONTRATISTA INDEPENDIENTE, AUTORIZO EXPRESAMENTE de manera previa, informada e inequívoca a la empresa{' '}
          {d.empresa.razonSocial} identificada con NIT No. {d.empresa.nit}, domicilio {d.empresa.domicilio}, correo
          electrónico {d.empresa.emailContacto ?? ''}, como responsable del Tratamiento, para recoger, almacenar, usar,
          circular, suprimir mis datos y conservar mi imagen por medio de videocámaras de seguridad instaladas en los
          establecimientos de la entidad, en cumplimiento a la Ley 1581 de 2012 y en desarrollo del contrato de
          prestación de servicios suscrito entre las partes.
        </Text>

        <Text style={s.parrafo}>
          Declaro que fui {informado} que la finalidad del tratamiento es la{' '}
          <Text style={s.subrayado}>
            seguridad de las personas, control de acceso, vigilancia de instalaciones, prevención de incidentes y
            soporte de eventuales investigaciones internas o administrativas
          </Text>
          , y que las imágenes podrán ser conservadas por el tiempo razonable y necesario para cumplir dichas
          finalidades, conforme a la normativa aplicable.
        </Text>

        <Text style={s.parrafo}>
          Asimismo, manifiesto que se me informó sobre los canales para ejercer mis derechos de acceso, rectificación,
          supresión, revocatoria y demás derechos que me asisten como titular de los datos, y que esta autorización se
          otorga de forma libre y voluntaria, sin perjuicio de las obligaciones contractuales y legales aplicables.
        </Text>

        <Text style={s.parrafo}>
          DERECHOS ARCO: Acceso, rectificación, cancelación, oposición, revocatoria a {CORREO_ARCO} (respuesta en 2
          días hábiles).
        </Text>

        <Text style={s.parrafo}>Atentamente,</Text>

        <View style={s.firmaBloque} wrap={false}>
          {firmaImg ? <Image src={firmaImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
          <View style={s.firmaLinea}>
            <Text style={s.negrita}>{d.contratistaNombre}</Text>
            <Text>CC. {d.contratistaCc}</Text>
            <Text>Contratista {d.cargo}</Text>
            {firmaFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {firmaFecha}</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderAutorizacionDatos(
  d: DatosAutorizacionPdf,
  firmaImg?: string | null,
  firmaFecha?: string | null,
): Promise<Buffer> {
  registrarBookman()
  return renderToBuffer(<DocumentoAutorizacion d={d} firmaImg={firmaImg} firmaFecha={firmaFecha} />)
}

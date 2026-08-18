import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { registrarBookman } from './fuentes'

/**
 * ACUERDO DE EVALUACIÓN PREVIA – SIN RELACIÓN LABORAL.
 *
 * Mismo papel membretado y tipografía que los contratos. El texto de las cláusulas
 * es fijo —no sale de una plantilla editable— porque su redacción es justamente lo
 * que sostiene que NO hay relación laboral: dejarla editable invitaría a romperla
 * sin darse cuenta. Solo se interpolan los datos de las partes y las fechas.
 */
const s = StyleSheet.create({
  page: { paddingTop: 122, paddingBottom: 96, paddingHorizontal: 72, fontFamily: 'Bookman Old Style' },
  tablaEnc: { borderWidth: 0.75, borderColor: '#94a3b8', marginBottom: 16 },
  tituloRow: { paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: '#94a3b8', backgroundColor: '#f8fafc' },
  tituloTabla: { fontSize: 11.5, fontFamily: 'Bookman Old Style', fontWeight: 'bold', textAlign: 'center', color: '#0f172a' },
  numeroTabla: { fontSize: 9.5, textAlign: 'center', color: '#334155', marginTop: 2 },
  encHeadRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 0.5, borderBottomColor: '#94a3b8' },
  encCol: { width: '50%', padding: 5, borderRightWidth: 0.5, borderRightColor: '#cbd5e1' },
  encColLast: { width: '50%', padding: 5 },
  encHead: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 9, textAlign: 'center', color: '#0f172a' },
  encLabel: { fontSize: 8, color: '#64748b' },
  encValor: { fontSize: 9, marginBottom: 3 },
  encFilaBorde: { borderTopWidth: 0.5, borderTopColor: '#e2e8f0' },
  intro: { marginBottom: 12, textAlign: 'justify' },
  clausulasTitulo: { textAlign: 'center', marginBottom: 8 },
  clausulaTitulo: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 10.5, marginTop: 8, marginBottom: 3, color: '#0f172a' },
  parrafo: { marginBottom: 5, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 10 },
  bulletPunto: { width: 10 },
  bulletTexto: { flex: 1, textAlign: 'justify' },
  cierre: { marginTop: 14, marginBottom: 4, textAlign: 'justify' },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 56 },
  firmaCol: { width: '45%' },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, marginTop: 30 },
  firmaNombre: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 9.5 },
  firmaLinea2: { fontSize: 9 },
  nota: { marginTop: 26, fontSize: 7.5, color: '#64748b', textAlign: 'center' },
  negrita: { fontFamily: 'Bookman Old Style', fontWeight: 'bold' },
})

export type DatosAcuerdoEvaluacionPdf = {
  empresa: DatosEmpresa
  numero: string
  /** Representante legal que firma por la empresa. */
  representanteLegal: string
  aspiranteNombre: string
  aspiranteDocumento: string
  aspiranteDireccion: string
  aspiranteEmail: string
  cargoEvaluado: string
  /** Fechas ya escritas en letras y números ("seis (06) de julio de 2026"). */
  fechaInicioTexto: string
  fechaFinTexto: string
  fechaFirmaTexto: string
  ciudadFirma: string
  aniosConfidencialidad: string
}

function CampoEnc({ label, valor, borde }: { label: string; valor: string; borde?: boolean }) {
  return (
    <View style={borde ? s.encFilaBorde : undefined}>
      <Text style={s.encLabel}>{label}</Text>
      <Text style={s.encValor}>{valor || '—'}</Text>
    </View>
  )
}

function DocumentoAcuerdo({ d }: { d: DatosAcuerdoEvaluacionPdf }) {
  const empresa = d.empresa.razonSocial
  return (
    <Document>
      <Page size="LETTER" style={[estilos.page, s.page]}>
        <MembreteFondo />

        <View style={s.tablaEnc}>
          <View style={s.tituloRow}>
            <Text style={s.tituloTabla}>ACUERDO DE EVALUACIÓN PREVIA – SIN RELACIÓN LABORAL</Text>
            <Text style={s.numeroTabla}>{d.numero}</Text>
          </View>
          <View style={s.encHeadRow}>
            <View style={s.encCol}><Text style={s.encHead}>EVALUADOR</Text></View>
            <View style={s.encColLast}><Text style={s.encHead}>ASPIRANTE</Text></View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={s.encCol}>
              <CampoEnc label="Nombre de la empresa" valor={empresa} />
              <CampoEnc label="Rep. legal" valor={d.representanteLegal} borde />
              <CampoEnc label="NIT" valor={d.empresa.nit} borde />
              <CampoEnc label="Domicilio principal" valor={d.empresa.direccion ?? ''} borde />
            </View>
            <View style={s.encColLast}>
              <CampoEnc label="Nombre" valor={d.aspiranteNombre} />
              <CampoEnc label="Identificación" valor={d.aspiranteDocumento} borde />
              <CampoEnc label="Dirección" valor={d.aspiranteDireccion} borde />
              <CampoEnc label="E-mail" valor={d.aspiranteEmail} borde />
            </View>
          </View>
        </View>

        <Text style={s.intro}>
          Entre los suscritos a saber: por una parte, la empresa {empresa}
          {d.empresa.nombreComercial && d.empresa.nombreComercial !== empresa
            ? ` y su marca comercial ${d.empresa.nombreComercial}`
            : ''}, quien en adelante se denominará EL EVALUADOR; y por la otra,{' '}
          {d.aspiranteNombre}, quien en adelante se denominará EL ASPIRANTE, hemos convenido celebrar
          el presente ACUERDO DE EVALUACIÓN PREVIA, el cual se regirá por las siguientes:
        </Text>
        <Text style={[s.intro, s.clausulasTitulo]}>CLÁUSULAS:</Text>

        <View wrap={false}>
          <Text style={s.clausulaTitulo}>CLÁUSULA PRIMERA: – OBJETO:</Text>
          <Text style={s.parrafo}>
            El presente acuerdo tiene por objeto permitir que LA EMPRESA realice una evaluación de
            carácter técnico, práctico, comportamental y personal al ASPIRANTE, con el propósito
            exclusivo de valorar su idoneidad para ocupar el cargo de {d.cargoEvaluado} en una
            eventual relación contractual futura.
          </Text>
        </View>

        <View wrap={false}>
          <Text style={s.clausulaTitulo}>CLÁUSULA SEGUNDA: – ALCANCE Y NATURALEZA:</Text>
          <Text style={s.parrafo}>
            Las actividades a realizar durante el proceso de evaluación NO constituyen una relación
            laboral, en la medida en que, si bien se reconocerá una remuneración económica por las
            actividades que realice EL ASPIRANTE, no habrá vinculación con el Sistema de Seguridad
            Social, ya que el proceso tiene carácter estrictamente observacional, formativo o simulado.
          </Text>
        </View>

        <View wrap={false}>
          <Text style={s.clausulaTitulo}>CLÁUSULA TERCERA: – DURACIÓN:</Text>
          <Text style={s.parrafo}>
            La evaluación se llevará a cabo entre el {d.fechaInicioTexto} y el {d.fechaFinTexto}, sin
            posibilidad de prórroga tácita o automática. Concluida la evaluación, EL EVALUADOR
            decidirá, a su entera discreción, si procede o no a contratar al ASPIRANTE.
          </Text>
        </View>

        <View wrap={false}>
          <Text style={s.clausulaTitulo}>CLÁUSULA CUARTA: – CONFIDENCIALIDAD:</Text>
          <Text style={s.parrafo}>
            EL ASPIRANTE se obliga a guardar estricta confidencialidad sobre cualquier información
            técnica, operativa o comercial a la que tenga acceso durante el desarrollo de la
            evaluación. Este deber se mantendrá incluso si no se llega a suscribir contrato
            posterior, por el término de {d.aniosConfidencialidad}.
          </Text>
        </View>

        <View wrap={false}>
          <Text style={s.clausulaTitulo}>CLÁUSULA QUINTA: – DECLARACIÓN DE VOLUNTAD:</Text>
          <Text style={s.parrafo}>Las partes declaran expresamente que:</Text>
          {[
            'Este acuerdo no constituye contrato de trabajo, ni precontrato laboral.',
            'No genera derechos laborales, indemnizaciones, ni estabilidad.',
            'La firma de este documento no obliga a la celebración de contrato alguno en el futuro.',
          ].map((t, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletPunto}>-</Text>
              <Text style={s.bulletTexto}>{t}</Text>
            </View>
          ))}
        </View>

        <Text style={s.cierre}>
          En constancia, se firma el presente documento en dos ejemplares del mismo tenor, en{' '}
          {d.ciudadFirma}, a los {d.fechaFirmaTexto}.
        </Text>

        <View style={s.firmas}>
          <View style={s.firmaCol}>
            <Text style={s.negrita}>EVALUADOR:</Text>
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{empresa}</Text>
              <Text style={s.firmaLinea2}>{d.representanteLegal}</Text>
              <Text style={s.firmaLinea2}>Representante Legal</Text>
            </View>
          </View>
          <View style={s.firmaCol}>
            <Text style={s.negrita}>ASPIRANTE:</Text>
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{d.aspiranteNombre}</Text>
              <Text style={s.firmaLinea2}>{d.aspiranteDocumento}</Text>
              <Text style={s.firmaLinea2}>{d.cargoEvaluado}</Text>
            </View>
          </View>
        </View>

        <Text style={s.nota}>
          El tratamiento de los datos personales se realiza conforme a la Ley 1581 de 2012 y demás
          normas concordantes, garantizando la protección, confidencialidad y uso adecuado de la
          información.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderAcuerdoEvaluacion(d: DatosAcuerdoEvaluacionPdf): Promise<Buffer> {
  registrarBookman()
  return renderToBuffer(<DocumentoAcuerdo d={d} />)
}

import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { fondoMembrete } from './fondo-membrete'
import { registrarBookman } from './fuentes'
import type { PlantillaResuelta } from '@/lib/contrato-variables'

const s = StyleSheet.create({
  // Hoja carta con papel membretado: deja espacio para encabezado (logo) y pie.
  page: { paddingTop: 122, paddingBottom: 96, paddingHorizontal: 72, fontFamily: 'Bookman Old Style' },
  negrita: { fontFamily: 'Bookman Old Style', fontWeight: 'bold' },
  tablaEnc: { borderWidth: 0.75, borderColor: '#94a3b8', marginBottom: 16 },
  tituloRow: { paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: '#94a3b8', backgroundColor: '#f8fafc' },
  tituloTabla: { fontSize: 12.5, fontFamily: 'Bookman Old Style', fontWeight: 'bold', textAlign: 'center', color: '#0f172a' },
  numeroTabla: { fontSize: 9.5, textAlign: 'center', color: '#334155', marginTop: 2 },
  encHeadRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 0.5, borderBottomColor: '#94a3b8' },
  encCol: { width: '50%', padding: 5, borderRightWidth: 0.5, borderRightColor: '#cbd5e1' },
  encColLast: { width: '50%', padding: 5 },
  encHead: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 9, textAlign: 'center', color: '#0f172a' },
  encLabel: { fontSize: 8, color: '#64748b' },
  encValor: { fontSize: 9, marginBottom: 3 },
  encFilaBorde: { borderTopWidth: 0.5, borderTopColor: '#e2e8f0' },
  intro: { marginBottom: 14, textAlign: 'justify' },
  clausulaTitulo: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', fontSize: 10.5, marginTop: 8, marginBottom: 3, color: '#0f172a' },
  parrafo: { marginBottom: 5, textAlign: 'justify' },
  cierre: { marginTop: 16, marginBottom: 4, textAlign: 'justify', fontFamily: 'Bookman Old Style', fontWeight: 'bold' },
  grupo: { fontFamily: 'Bookman Old Style', fontWeight: 'bold', marginTop: 5, marginBottom: 2 },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
  bulletPunto: { width: 10 },
  bulletTexto: { flex: 1, textAlign: 'justify' },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 },
  firmaCol: { width: '45%' },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, marginTop: 28 },
  firmaImg: { width: 150, height: 52, objectFit: 'contain', alignSelf: 'flex-start', marginBottom: -6 },
  firmaEspacio: { height: 46 },
  firmaFecha: { fontSize: 7.5, color: '#64748b', marginTop: 1 },
})

export type EncabezadoContrato = {
  contratanteNombre: string
  contratanteRep: string
  contratanteNit: string
  contratanteDir: string
  contratistaNombre: string
  contratistaCc: string
  contratistaDir: string
  contratistaEmail: string
  tipo: string
  plazo: string
  valorTotal: string
  honorarios: string
  fechaSuscripcion: string
  fechaTerminacion: string
}

export type DatosContratoOpsPdf = {
  empresa: DatosEmpresa
  plantilla: PlantillaResuelta
  encabezado: EncabezadoContrato
  firmaContratanteNombre: string
  firmaContratistaNombre: string
  // Imágenes de firma (data URI PNG) e info de fecha, si el contrato ya fue firmado.
  firmaContratanteImg?: string | null
  firmaContratistaImg?: string | null
  firmaContratanteFecha?: string | null
  firmaContratistaFecha?: string | null
}

function CampoEnc({ label, valor, borde }: { label: string; valor: string; borde?: boolean }) {
  return (
    <View style={borde ? s.encFilaBorde : undefined}>
      <Text style={s.encLabel}>{label}</Text>
      <Text style={s.encValor}>{valor}</Text>
    </View>
  )
}

function TablaEncabezado({ e, titulo, numero }: { e: EncabezadoContrato; titulo: string; numero: string }) {
  return (
    <View style={s.tablaEnc}>
      {/* Fila 1: título + número (ancho completo) */}
      <View style={s.tituloRow}>
        <Text style={s.tituloTabla}>{titulo}</Text>
        {numero ? <Text style={s.numeroTabla}>No. {numero}</Text> : null}
      </View>
      {/* Fila 2: cabeceras de las dos columnas */}
      <View style={s.encHeadRow}>
        <View style={s.encCol}><Text style={s.encHead}>CONTRATANTE</Text></View>
        <View style={s.encColLast}><Text style={s.encHead}>CONTRATISTA</Text></View>
      </View>
      {/* Fila 3: datos */}
      <View style={{ flexDirection: 'row' }}>
        <View style={s.encCol}>
          <CampoEnc label="Nombre de la empresa" valor={e.contratanteNombre} />
          <CampoEnc label="Representante legal" valor={e.contratanteRep} borde />
          <CampoEnc label="NIT" valor={e.contratanteNit} borde />
          <CampoEnc label="Dirección" valor={e.contratanteDir} borde />
          <CampoEnc label="Tipo de contrato" valor={e.tipo} borde />
          <CampoEnc label="Valor total del contrato" valor={e.valorTotal} borde />
          <CampoEnc label="Honorarios mensuales" valor={e.honorarios} borde />
        </View>
        <View style={s.encColLast}>
          <CampoEnc label="Nombre" valor={e.contratistaNombre} />
          <CampoEnc label="Identificación" valor={e.contratistaCc} borde />
          <CampoEnc label="Dirección" valor={e.contratistaDir} borde />
          <CampoEnc label="E-mail" valor={e.contratistaEmail} borde />
          <CampoEnc label="Plazo de ejecución" valor={e.plazo} borde />
          <CampoEnc label="Fecha de suscripción" valor={e.fechaSuscripcion} borde />
          <CampoEnc label="Fecha de terminación" valor={e.fechaTerminacion} borde />
        </View>
      </View>
    </View>
  )
}

function DocumentoContrato({ d, fondo }: { d: DatosContratoOpsPdf; fondo?: string }) {
  const { plantilla: p } = d
  return (
    <Document>
      <Page size="LETTER" style={[estilos.page, s.page]}>
        <MembreteFondo fondo={fondo} empresa={d.empresa} />
        <TablaEncabezado e={d.encabezado} titulo={p.titulo} numero={p.numero} />
        <Text style={s.intro}>{p.intro}</Text>

        {p.clausulas.map((c, i) => (
          <View key={i} wrap={false}>
            <Text style={s.clausulaTitulo}>{c.titulo}</Text>
            {c.parrafos.map((par, j) => (
              <Text key={j} style={s.parrafo}>{par}</Text>
            ))}
            {c.funciones?.map((g, k) => (
              <View key={k}>
                <Text style={s.grupo}>{g.grupo}</Text>
                {g.items.map((it, m) => (
                  <View key={m} style={s.bullet}>
                    <Text style={s.bulletPunto}>•</Text>
                    <Text style={s.bulletTexto}>{it}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {p.cierre ? <Text style={s.cierre}>{p.cierre}</Text> : null}

        <View style={s.firmas} wrap={false}>
          <View style={s.firmaCol}>
            {d.firmaContratanteImg ? <Image src={d.firmaContratanteImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
            <View style={s.firmaLinea}>
              <Text style={s.negrita}>EL CONTRATANTE</Text>
              <Text>{d.firmaContratanteNombre}</Text>
              {d.firmaContratanteFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {d.firmaContratanteFecha}</Text> : null}
            </View>
          </View>
          <View style={s.firmaCol}>
            {d.firmaContratistaImg ? <Image src={d.firmaContratistaImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
            <View style={s.firmaLinea}>
              <Text style={s.negrita}>{d.plantilla.denominacionContratista ?? 'LA CONTRATISTA'}</Text>
              <Text>{d.firmaContratistaNombre}</Text>
              {d.firmaContratistaFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {d.firmaContratistaFecha}</Text> : null}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderContratoOps(d: DatosContratoOpsPdf): Promise<Buffer> {
  registrarBookman()
  // El membrete puede venir de Ajustes; si no hay uno propio, `fondo` queda
  // indefinido y se usa el de fábrica, que ya trae el pie impreso.
  const { src, propio } = await fondoMembrete()
  const fondo = propio ? src : undefined
  return renderToBuffer(<DocumentoContrato d={d} fondo={fondo} />)
}

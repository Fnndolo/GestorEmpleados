import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { MembreteFondo, type DatosEmpresa } from './membrete'
import { fondoMembrete } from './fondo-membrete'
import { registrarBookman } from './fuentes'
import type { PlantillaResuelta } from '@/lib/contrato-variables'

const s = StyleSheet.create({
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
  firmaRolSub: { fontSize: 8.5, color: '#334155' },
})

/** Tabla de encabezado EMPLEADOR/EMPLEADO (recuadro de la página 1 del formato real). */
export type EncabezadoContratoLaboral = {
  empleadorNombre: string
  empleadorRep: string
  empleadorNit: string
  empleadorDir: string
  tipoContrato: string
  salario: string
  auxTransporte: string
  empleadoNombre: string
  empleadoCc: string
  empleadoDir: string
  empleadoEmail: string
  duracion: string
  fechaInicio: string
  fechaFin: string
}

export type DatosContratoLaboralPdf = {
  empresa: DatosEmpresa
  plantilla: PlantillaResuelta
  encabezado: EncabezadoContratoLaboral
  firmaEmpleadorNombre: string
  firmaEmpleadoNombre: string
  firmaEmpleadoCc: string
  // Imágenes de firma (data URI PNG) e info de fecha, si ya se firmó.
  firmaEmpleadorImg?: string | null
  firmaEmpleadoImg?: string | null
  firmaEmpleadorFecha?: string | null
  firmaEmpleadoFecha?: string | null
}

function CampoEnc({ label, valor, borde }: { label: string; valor: string; borde?: boolean }) {
  return (
    <View style={borde ? s.encFilaBorde : undefined}>
      <Text style={s.encLabel}>{label}</Text>
      <Text style={s.encValor}>{valor}</Text>
    </View>
  )
}

function TablaEncabezado({ e, titulo, numero }: { e: EncabezadoContratoLaboral; titulo: string; numero: string }) {
  return (
    <View style={s.tablaEnc}>
      <View style={s.tituloRow}>
        <Text style={s.tituloTabla}>{titulo}</Text>
        {numero ? <Text style={s.numeroTabla}>No. {numero}</Text> : null}
      </View>
      <View style={s.encHeadRow}>
        <View style={s.encCol}><Text style={s.encHead}>EMPLEADOR</Text></View>
        <View style={s.encColLast}><Text style={s.encHead}>EMPLEADO</Text></View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={s.encCol}>
          <CampoEnc label="Nombre de la empresa" valor={e.empleadorNombre} />
          <CampoEnc label="Rep. legal" valor={e.empleadorRep} borde />
          <CampoEnc label="NIT" valor={e.empleadorNit} borde />
          <CampoEnc label="Dirección" valor={e.empleadorDir} borde />
          <CampoEnc label="Tipo de contrato" valor={e.tipoContrato} borde />
          <CampoEnc label="Salario" valor={e.salario} borde />
          <CampoEnc label="Auxilio de transporte" valor={e.auxTransporte} borde />
        </View>
        <View style={s.encColLast}>
          <CampoEnc label="Nombre" valor={e.empleadoNombre} />
          <CampoEnc label="Identificación" valor={e.empleadoCc} borde />
          <CampoEnc label="Dirección" valor={e.empleadoDir} borde />
          <CampoEnc label="E-mail" valor={e.empleadoEmail} borde />
          <CampoEnc label="Duración del contrato" valor={e.duracion} borde />
          <CampoEnc label="Fecha de iniciación de labores" valor={e.fechaInicio} borde />
          <CampoEnc label="Fecha que finaliza sus labores" valor={e.fechaFin} borde />
        </View>
      </View>
    </View>
  )
}

function DocumentoContrato({ d, fondo }: { d: DatosContratoLaboralPdf; fondo?: string }) {
  const { plantilla: p } = d
  return (
    <Document>
      <Page size="LETTER" style={[estilos.page, s.page]}>
        <MembreteFondo fondo={fondo} empresa={d.empresa} />
        <TablaEncabezado e={d.encabezado} titulo={p.titulo} numero={p.numero} />
        {/* wrap={false} por párrafo/viñeta: el texto justificado de react-pdf se
            superpone si un párrafo queda partido en el salto de página; así los
            saltos ocurren solo ENTRE bloques, nunca a mitad de un párrafo. */}
        {p.intro.split('\n').map((par, i) => (
          <Text key={i} style={s.intro} wrap={false}>{par}</Text>
        ))}

        {p.clausulas.map((c, i) => (
          <View key={i}>
            {/* minPresenceAhead evita que el título quede huérfano al final de la página */}
            <Text style={s.clausulaTitulo} minPresenceAhead={40}>{c.titulo}</Text>
            {c.parrafos.map((par, j) =>
              par.startsWith('- ') ? (
                <View key={j} style={s.bullet} wrap={false}>
                  <Text style={s.bulletPunto}>•</Text>
                  <Text style={s.bulletTexto}>{par.slice(2)}</Text>
                </View>
              ) : (
                <Text key={j} style={s.parrafo} wrap={false}>{par}</Text>
              ),
            )}
            {c.funciones?.map((g, k) => (
              <View key={k}>
                {g.grupo ? <Text style={s.grupo} minPresenceAhead={30}>{g.grupo}</Text> : null}
                {g.items.map((it, m) => (
                  <View key={m} style={s.bullet} wrap={false}>
                    <Text style={s.bulletPunto}>•</Text>
                    <Text style={s.bulletTexto}>{it}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {p.cierre ? <Text style={s.cierre} wrap={false}>{p.cierre}</Text> : null}

        <View style={s.firmas} wrap={false}>
          <View style={s.firmaCol}>
            {d.firmaEmpleadorImg ? <Image src={d.firmaEmpleadorImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
            <View style={s.firmaLinea}>
              <Text style={s.negrita}>EL EMPLEADOR:</Text>
              <Text>{d.empresa.razonSocial}</Text>
              <Text style={s.firmaRolSub}>{d.firmaEmpleadorNombre} — Representante Legal</Text>
              {d.firmaEmpleadorFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {d.firmaEmpleadorFecha}</Text> : null}
            </View>
          </View>
          <View style={s.firmaCol}>
            {d.firmaEmpleadoImg ? <Image src={d.firmaEmpleadoImg} style={s.firmaImg} /> : <View style={s.firmaEspacio} />}
            <View style={s.firmaLinea}>
              <Text style={s.negrita}>EL EMPLEADO:</Text>
              <Text>{d.firmaEmpleadoNombre}</Text>
              <Text style={s.firmaRolSub}>CC. {d.firmaEmpleadoCc}</Text>
              {d.firmaEmpleadoFecha ? <Text style={s.firmaFecha}>Firmado electrónicamente el {d.firmaEmpleadoFecha}</Text> : null}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function renderContratoLaboral(d: DatosContratoLaboralPdf): Promise<Buffer> {
  registrarBookman()
  // El membrete puede venir de Ajustes; si no hay uno propio, `fondo` queda
  // indefinido y se usa el de fábrica, que ya trae el pie impreso.
  const { src, propio } = await fondoMembrete()
  const fondo = propio ? src : undefined
  return renderToBuffer(<DocumentoContrato d={d} fondo={fondo} />)
}

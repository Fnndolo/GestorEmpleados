import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { TIPO_VINCULO } from '@/lib/etiquetas'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'

export type DatosCertificacion = {
  tipo: 'SIMPLE' | 'CON_SALARIO' | 'CON_FUNCIONES' | 'ENTIDAD_FINANCIERA'
  dirigidaA: string | null
  empresa: DatosEmpresa
  colaborador: {
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
    cargo: string | null
    funciones: string | null
    tipoVinculo: string
    fechaIngreso: Date
    salario: number | null
  }
  ciudad: string
  fecha: Date
  firmaDataUri?: string | null
}

function CuerpoCertificacion({ d }: { d: DatosCertificacion }) {
  const nombre = `${d.colaborador.nombres} ${d.colaborador.apellidos}`.toUpperCase()
  const incluyeSalario = d.tipo === 'CON_SALARIO' || d.tipo === 'ENTIDAD_FINANCIERA'
  const incluyeFunciones = d.tipo === 'CON_FUNCIONES'

  return (
    <>
      <Text style={estilos.titulo}>LA EMPRESA {d.empresa.razonSocial.toUpperCase()} CERTIFICA:</Text>

      <Text style={estilos.parrafo}>
        Que el(la) señor(a) <Text style={estilos.negrita}>{nombre}</Text>, identificado(a) con{' '}
        {d.colaborador.tipoDocumento} No. <Text style={estilos.negrita}>{d.colaborador.numeroDocumento}</Text>,
        labora en nuestra empresa mediante contrato de <Text style={estilos.negrita}>{TIPO_VINCULO[d.colaborador.tipoVinculo]}</Text>
        {d.colaborador.cargo ? <> desempeñando el cargo de <Text style={estilos.negrita}>{d.colaborador.cargo}</Text></> : null}
        , desde el <Text style={estilos.negrita}>{formatFechaLarga(d.colaborador.fechaIngreso)}</Text>.
      </Text>

      {incluyeSalario && d.colaborador.salario != null && (
        <Text style={estilos.parrafo}>
          Devenga una asignación salarial mensual de{' '}
          <Text style={estilos.negrita}>{fmtCOP(d.colaborador.salario)}</Text> ({pesosEnLetras(d.colaborador.salario)}).
        </Text>
      )}

      {incluyeFunciones && d.colaborador.funciones && (
        <View style={estilos.parrafo}>
          <Text style={estilos.negrita}>Funciones del cargo:</Text>
          <Text>{d.colaborador.funciones}</Text>
        </View>
      )}

      <Text style={estilos.parrafo}>
        La presente certificación se expide
        {d.dirigidaA ? <> a solicitud del interesado, dirigida a <Text style={estilos.negrita}>{d.dirigidaA}</Text>,</> : <> a solicitud del interesado</>}
        {' '}en {d.ciudad}, a los {formatFechaLarga(d.fecha)}.
      </Text>

      <View style={estilos.firma}>
        {d.firmaDataUri ? <Image src={d.firmaDataUri} style={{ width: 150, height: 60, objectFit: 'contain', marginBottom: -6 }} /> : null}
        <View style={estilos.firmaLinea}>
          <Text style={estilos.negrita}>Departamento de Talento Humano</Text>
          <Text>{d.empresa.nombreComercial}</Text>
        </View>
      </View>
    </>
  )
}

function DocumentoCertificacion({ d }: { d: DatosCertificacion }) {
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <CuerpoCertificacion d={d} />
        <Pie texto={`${d.empresa.razonSocial} · NIT ${d.empresa.nit} · Documento generado electrónicamente`} />
      </Page>
    </Document>
  )
}

export async function renderCertificacion(d: DatosCertificacion): Promise<Buffer> {
  return renderToBuffer(<DocumentoCertificacion d={d} />)
}

// Conversión simple de pesos a letras (aproximada, para el texto del certificado)
function pesosEnLetras(valor: number): string {
  return `${new Intl.NumberFormat('es-CO').format(Math.round(valor))} pesos M/CTE`
}

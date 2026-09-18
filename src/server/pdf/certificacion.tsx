import { Document, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesCertificacion, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'

export type DatosCertificacion = {
  tipo: 'SIMPLE' | 'CON_SALARIO' | 'CON_FUNCIONES' | 'ENTIDAD_FINANCIERA'
  /**
   * LABORAL para empleados; CONTRACTUAL para contratistas OPS, donde no hay
   * cargo, salario ni funciones sino objeto contractual y honorarios. Decir
   * "labora" y "cargo" de un contratista es admitir subordinación por escrito.
   */
  clase: 'LABORAL' | 'CONTRACTUAL'
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
  /** Solo en la certificación contractual: datos del contrato OPS vigente. */
  contratoOps?: {
    numero: string
    objeto: string
    valorTotal: number
    valorMensual: number | null
    fechaInicio: Date
    fechaFin: Date
  } | null
  ciudad: string
  fecha: Date
  firmaDataUri?: string | null
}

/**
 * El texto de la certificación viene de Ajustes → Plantillas de documentos:
 * uno para la laboral (CERTIFICACION_LABORAL) y otro para la contractual
 * (CERTIFICACION_CONTRACTUAL), porque la del contratista habla de contrato,
 * objeto y honorarios, nunca de cargo ni salario. Qué partes salen (salario,
 * funciones, destinatario) lo deciden las variables según el tipo pedido.
 * Aquí solo se pone la hoja: membrete, título, firma de Talento Humano y pie.
 */
function DocumentoCertificacion({ d, texto, membrete, fondo }: { d: DatosCertificacion; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit} · Documento generado electrónicamente`}>
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} />

        <View style={estilos.firma} wrap={false}>
          {d.firmaDataUri ? <Image src={d.firmaDataUri} style={{ width: 150, height: 60, objectFit: 'contain', marginBottom: -6 }} /> : null}
          <View style={estilos.firmaLinea}>
            <Text style={estilos.negrita}>Departamento de Talento Humano</Text>
            <Text>{d.empresa.nombreComercial}</Text>
          </View>
        </View>
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

/** Renderiza la certificación con el texto vigente de Ajustes, salvo que se pase `plantilla` (muestras). */
export async function renderCertificacion(d: DatosCertificacion, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto(d.clase === 'CONTRACTUAL' ? 'CERTIFICACION_CONTRACTUAL' : 'CERTIFICACION_LABORAL'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(
    <DocumentoCertificacion d={d} texto={resolverTexto(texto, variablesCertificacion(d))} membrete={texto.usaMembrete} fondo={fondo} />,
  )
}

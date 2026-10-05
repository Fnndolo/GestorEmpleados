import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { FirmasTerminacion } from './firmas-terminacion'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesCambioHorario, type DatosVarsCambioHorario, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { NOMBRE_DIA, ORDEN_DIAS, textoFranja, type DiasHorario } from '@/lib/horarios'

export type DatosCambioHorario = DatosVarsCambioHorario & {
  empresa: DatosEmpresa & DatosVarsCambioHorario['empresa']
  /** El horario nuevo, día por día. */
  dias: DiasHorario
}

/** El horario nuevo: un renglón por día, de lunes a domingo. */
function TablaHorario({ dias }: { dias: DiasHorario }) {
  return (
    <View style={estilos.tabla}>
      {ORDEN_DIAS.map((d) => {
        const f = dias[d]
        return (
          <View key={d} style={estilos.fila} wrap={false}>
            <Text style={{ width: '30%', ...estilos.negrita }}>{NOMBRE_DIA[d]}</Text>
            <Text style={{ width: '70%', color: f ? undefined : '#64748b' }}>{f ? textoFranja(f) : 'Descanso'}</Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Comunicación de cambio de horario: el texto viene de Ajustes → Plantillas
 * de documentos (clave CAMBIO_HORARIO); aquí va la hoja, la tabla del horario
 * nuevo en el sitio de `[tabla]` y la línea de Talento Humano.
 */
function Doc({ d, texto, membrete, fondo }: { d: DatosCambioHorario; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} estilo={{ fontSize: 10.5 }}>
        <Text style={[estilos.titulo, { marginBottom: 14 }]}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} compacto tabla={<TablaHorario dias={d.dias} />} />
        <FirmasTerminacion empresa={{ razonSocial: d.empresa.razonSocial, firmante: null, firma: null }} trabajador={null} />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

export async function renderCambioHorario(d: DatosCambioHorario, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('CAMBIO_HORARIO'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesCambioHorario(d))} membrete={texto.usaMembrete} fondo={fondo} />)
}

import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { FirmasTerminacion, type FirmaAplicada } from './firmas-terminacion'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesPazYSalvo, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'

/** Un área del checklist tal como quedó verificada. */
export type AreaPazYSalvo = { area: string; concepto: string; verificadoPor: string | null; verificadoEn: string | null }

export type DatosActaPazYSalvo = {
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  ciudad: string
  fecha: Date
  fechaIngreso: Date
  fechaRetiro: Date
  motivo: string
  areas: AreaPazYSalvo[]
  /** Quien firma por la empresa (Talento Humano) y su firma, si ya firmó. */
  firmante?: string | null
  firmaEmpresa?: FirmaAplicada | null
  /** Firma del trabajador, si ya firmó. */
  firmaTrabajador?: FirmaAplicada | null
}

/** Anchos de la tabla de áreas; suman 100 %. */
const COLS = { area: '18%', concepto: '42%', quien: '24%', fecha: '16%' }

function TablaAreas({ areas }: { areas: AreaPazYSalvo[] }) {
  return (
    <View style={estilos.tabla}>
      <View style={[estilos.fila, { borderBottomWidth: 1, borderBottomColor: '#94a3b8' }]}>
        <Text style={{ width: COLS.area, color: '#64748b' }}>Área</Text>
        <Text style={{ width: COLS.concepto, color: '#64748b' }}>Verificado</Text>
        <Text style={{ width: COLS.quien, color: '#64748b' }}>Verificó</Text>
        <Text style={{ width: COLS.fecha, color: '#64748b' }}>Fecha</Text>
      </View>
      {areas.map((a) => (
        <View key={a.area} style={estilos.fila} wrap={false}>
          <Text style={{ width: COLS.area, ...estilos.negrita }}>{a.area}</Text>
          <Text style={{ width: COLS.concepto }}>{a.concepto}</Text>
          <Text style={{ width: COLS.quien }}>{a.verificadoPor ?? '—'}</Text>
          <Text style={{ width: COLS.fecha }}>{a.verificadoEn ?? '—'}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * Acta de paz y salvo de la terminación: la entrega del puesto verificada por
 * área. El texto viene de Ajustes → Plantillas de documentos (clave
 * PAZ_Y_SALVO); aquí solo se pone la hoja: tabla de áreas, firmas y pie. Las
 * firmas tienen sitio fijo: al firmar se re-renderiza el mismo PDF con el PNG.
 */
function Doc({ d, texto, membrete, fondo }: { d: DatosActaPazYSalvo; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`}>
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={<TablaAreas areas={d.areas} />} />
        <FirmasTerminacion
          empresa={{ razonSocial: d.empresa.razonSocial, firmante: d.firmante ?? null, firma: d.firmaEmpresa ?? null }}
          trabajador={{ nombre: d.colaborador.nombre, documento: d.colaborador.documento, firma: d.firmaTrabajador ?? null }}
        />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

/** Renderiza el acta con el texto vigente de Ajustes, salvo que se pase `plantilla` (muestras). */
export async function renderActaPazYSalvo(d: DatosActaPazYSalvo, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('PAZ_Y_SALVO'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesPazYSalvo(d))} membrete={texto.usaMembrete} fondo={fondo} />)
}

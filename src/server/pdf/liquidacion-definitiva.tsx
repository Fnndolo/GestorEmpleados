import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { FirmasTerminacion, type FirmaAplicada } from './firmas-terminacion'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesLiquidacion, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import type { FilaLiquidacion } from '@/lib/terminaciones/liquidacion-filas'
import { fmtCOP } from '@/lib/moneda'

export type DatosLiquidacionPdf = {
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  ciudad: string
  fecha: Date
  fechaIngreso: Date
  fechaRetiro: Date
  motivo: string
  dias: number
  salarioBase: number
  ingresos: FilaLiquidacion[]
  deducciones: FilaLiquidacion[]
  totalIngresos: number
  totalDeducciones: number
  total: number
  firmante?: string | null
  firmaEmpresa?: FirmaAplicada | null
  firmaTrabajador?: FirmaAplicada | null
}

const FILA = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 1.5, fontSize: 9, lineHeight: 1.25 }

function Bloque({ titulo, filas, total }: { titulo: string; filas: FilaLiquidacion[]; total: number }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold', marginBottom: 1 }}>{titulo.toUpperCase()}</Text>
      {filas.map((f) => (
        <View key={f.k} style={FILA} wrap={false}>
          <Text>{f.k}{f.sub ? <Text style={{ fontSize: 7.5, color: '#64748b' }}>  {f.sub}</Text> : null}</Text>
          <Text>{fmtCOP(f.v)}</Text>
        </View>
      ))}
      <View style={{ ...FILA, borderBottomWidth: 0 }}>
        <Text style={estilos.negrita}>Total {titulo.toLowerCase()}</Text>
        <Text style={estilos.negrita}>{fmtCOP(total)}</Text>
      </View>
    </View>
  )
}

function Tabla({ d }: { d: DatosLiquidacionPdf }) {
  return (
    <View style={estilos.tabla}>
      <Text style={{ fontSize: 8, color: '#475569', marginBottom: 4 }}>
        {d.dias} días liquidados · salario base {fmtCOP(d.salarioBase)}
      </Text>
      <Bloque titulo="Ingresos" filas={d.ingresos} total={d.totalIngresos} />
      {d.deducciones.length > 0 && <Bloque titulo="Deducciones" filas={d.deducciones} total={d.totalDeducciones} />}
      <View style={{ marginTop: 2, backgroundColor: '#0f172a', borderRadius: 3, paddingVertical: 6, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#ffffff', fontFamily: 'Helvetica-Bold' }}>Total a pagar</Text>
        <Text style={{ color: '#ffffff', fontFamily: 'Helvetica-Bold' }}>{fmtCOP(d.total)}</Text>
      </View>
    </View>
  )
}

/**
 * Liquidación definitiva que firma el trabajador (recibido). Las cifras son las
 * mismas de la pantalla de la terminación (`filasLiquidacion`); el texto
 * alrededor se edita en Ajustes → Plantillas de documentos (clave
 * LIQUIDACION_DEFINITIVA).
 */
function Doc({ d, texto, membrete, fondo }: { d: DatosLiquidacionPdf; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`}>
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={<Tabla d={d} />} />
        <FirmasTerminacion
          empresa={{ razonSocial: d.empresa.razonSocial, firmante: d.firmante ?? null, firma: d.firmaEmpresa ?? null }}
          trabajador={{ nombre: d.colaborador.nombre, documento: d.colaborador.documento, firma: d.firmaTrabajador ?? null }}
        />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

export async function renderLiquidacionDefinitiva(d: DatosLiquidacionPdf, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('LIQUIDACION_DEFINITIVA'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesLiquidacion({ ...d, salarioBase: d.salarioBase }))} membrete={texto.usaMembrete} fondo={fondo} />)
}

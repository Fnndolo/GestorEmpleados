import { Document, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesOrdenPago, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaLarga } from '@/lib/fechas'

/**
 * Orden de pago de horas extra: en esta empresa se pagan APARTE de la nómina,
 * así que no hay desprendible que las cubra. Este PDF resume el monto y lo deja
 * firmar por el colaborador (Ley 527) antes de pagarse; el comprobante de que
 * ya se pagó es un documento aparte, que se sube después.
 *
 * El recuadro de firma tiene una posición FIJA (a diferencia de un PDF subido,
 * este lo arma la app): no hace falta detectar dónde va, solo dejar el espacio
 * reservado y, cuando ya está firmada, dibujar el PNG ahí encima al re-renderizar.
 *
 * El título y el texto alrededor de la tabla se editan en Ajustes → Plantillas
 * de documentos (clave ORDEN_PAGO_HORAS_EXTRA), y ahí mismo se elige si va
 * sobre el papel membretado (de fábrica, sí); la cabecera (número, fecha,
 * colaborador, período), la tabla de horas, el total y la firma los pone la app.
 */

const s = StyleSheet.create({
  page: { fontSize: 10 },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4 },
  subtitulo: { fontSize: 9.5, textAlign: 'center', color: '#475569', marginBottom: 20 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  etiqueta: { color: '#475569' },
  negrita: { fontFamily: 'Helvetica-Bold' },
  tabla: { marginTop: 18, borderWidth: 0.75, borderColor: '#94a3b8', borderRadius: 3 },
  filaTabla: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1' },
  encTabla: { backgroundColor: '#f1f5f9' },
  celda: { flex: 1, padding: 6, fontSize: 9 },
  celdaEnc: { flex: 1, padding: 6, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#334155' },
  celdaDer: { textAlign: 'right' },
  totalBox: {
    marginTop: 4, marginBottom: 16, backgroundColor: '#0f172a', borderRadius: 3, padding: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalTexto: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  firma: { marginTop: 40, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4, width: 220 },
  firmaImg: { width: 150, height: 52, objectFit: 'contain', marginBottom: -6 },
  firmaFecha: { fontSize: 7.5, color: '#64748b', marginTop: 1 },
})

const ETIQUETA_HORA: Record<string, string> = { HED: 'Diurna', HEN: 'Nocturna', HEDDF: 'Dom/fest. diurna', HENDF: 'Dom/fest. nocturna' }

export type DatosOrdenPagoHorasExtra = {
  empresa: DatosEmpresa
  numero: string
  fecha: Date
  colaborador: { nombre: string; documento: string; banco: string | null; tipoCuenta: string | null; numeroCuenta: string | null }
  periodo: { desde: string; hasta: string }
  detalleHoras: Record<string, number>
  horasExtra: number
  valor: number
  /** Firma electrónica del colaborador aceptando el monto; null si todavía no ha firmado. */
  firma?: { dataUri: string; fecha: string } | null
}

function TablaHoras({ d }: { d: DatosOrdenPagoHorasExtra }) {
  const codigos = Object.entries(d.detalleHoras).filter(([, h]) => h > 0)
  return (
    <>
      <View style={s.tabla}>
        <View style={[s.filaTabla, s.encTabla]}>
          <Text style={s.celdaEnc}>Tipo de hora</Text>
          <Text style={[s.celdaEnc, s.celdaDer]}>Horas</Text>
        </View>
        {codigos.map(([c, h]) => (
          <View key={c} style={s.filaTabla}>
            <Text style={s.celda}>{ETIQUETA_HORA[c] ?? c}</Text>
            <Text style={[s.celda, s.celdaDer]}>{h.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h</Text>
          </View>
        ))}
        <View style={s.filaTabla}>
          <Text style={[s.celda, s.negrita]}>Total horas extra</Text>
          <Text style={[s.celda, s.celdaDer, s.negrita]}>{d.horasExtra.toLocaleString('es-CO', { maximumFractionDigits: 2 })} h</Text>
        </View>
      </View>
      <View style={s.totalBox}>
        <Text style={s.totalTexto}>Total a pagar</Text>
        <Text style={s.totalTexto}>{fmtCOP(d.valor)}</Text>
      </View>
    </>
  )
}

function Doc({ d, texto, membrete, fondo }: { d: DatosOrdenPagoHorasExtra; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  return (
    <Document>
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} estilo={s.page} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`}>
        <Text style={s.titulo}>{texto.titulo.toUpperCase()}</Text>
        <Text style={s.subtitulo}>No. {d.numero} · {formatFechaLarga(d.fecha)}</Text>

        <View style={s.fila}>
          <Text style={s.etiqueta}>Colaborador</Text>
          <Text style={s.negrita}>{d.colaborador.nombre} · {d.colaborador.documento}</Text>
        </View>
        <View style={s.fila}>
          <Text style={s.etiqueta}>Período</Text>
          <Text style={s.negrita}>{formatFechaLarga(new Date(`${d.periodo.desde}T00:00:00.000Z`))} a {formatFechaLarga(new Date(`${d.periodo.hasta}T00:00:00.000Z`))}</Text>
        </View>

        <BloquesPdf bloques={texto.bloques} tabla={<TablaHoras d={d} />} />

        <View style={s.firma} wrap={false}>
          {d.firma && <Image src={d.firma.dataUri} style={s.firmaImg} />}
          <Text style={s.negrita}>{d.colaborador.nombre}</Text>
          <Text style={{ fontSize: 8.5, color: '#64748b' }}>{d.colaborador.documento}</Text>
          {d.firma && <Text style={s.firmaFecha}>Firmado electrónicamente el {d.firma.fecha}</Text>}
        </View>
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

/**
 * Renderiza la orden con el texto vigente de Ajustes, salvo que se pase
 * `plantilla` (muestras). El membrete propio de la empresa se resuelve aquí
 * mismo, solo si el texto lo usa.
 */
export async function renderOrdenPagoHorasExtra(d: DatosOrdenPagoHorasExtra, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto('ORDEN_PAGO_HORAS_EXTRA'))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesOrdenPago(d))} membrete={texto.usaMembrete} fondo={fondo} />)
}

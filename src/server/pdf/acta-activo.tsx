import { Document, Page, Text, View, Image, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, Pie, type DatosEmpresa } from './membrete'
import { BloquesPdf, NotasPdf } from './bloques-texto'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesActaActivo, type PlantillaTexto, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'

export type ActivoActa = {
  codigo: string; nombre: string; tipo: string
  marca: string | null; serie: string | null; valor: number | null
}

export type DatosActaActivo = {
  tipo: 'entrega' | 'devolucion'
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  /** Uno o varios activos: una entrega hecha en un mismo acto va en UNA sola acta. */
  activos: ActivoActa[]
  ciudad: string
  fecha: Date
  /** Firma digital del colaborador (data URI PNG); si falta, queda la línea para firmar. */
  firmaDataUri?: string | null
  firmaFecha?: Date | null
}

/** Anchos de la tabla de activos; suman 100 %. */
const COLS = { codigo: '14%', nombre: '30%', tipo: '16%', marca: '14%', serie: '14%', valor: '12%' }

function TablaActivos({ activos }: { activos: ActivoActa[] }) {
  const varios = activos.length > 1
  const total = activos.reduce((s, a) => s + (a.valor ?? 0), 0)
  const hayValores = activos.some((a) => a.valor != null)
  return (
    <View style={estilos.tabla}>
      <View style={[estilos.fila, { borderBottomWidth: 1, borderBottomColor: '#94a3b8' }]}>
        <Text style={{ width: COLS.codigo, color: '#64748b' }}>Código</Text>
        <Text style={{ width: COLS.nombre, color: '#64748b' }}>Activo</Text>
        <Text style={{ width: COLS.tipo, color: '#64748b' }}>Tipo</Text>
        <Text style={{ width: COLS.marca, color: '#64748b' }}>Marca</Text>
        <Text style={{ width: COLS.serie, color: '#64748b' }}>Serie</Text>
        <Text style={{ width: COLS.valor, color: '#64748b', textAlign: 'right' }}>Valor</Text>
      </View>
      {activos.map((a) => (
        <View key={a.codigo} style={estilos.fila} wrap={false}>
          <Text style={{ width: COLS.codigo }}>{a.codigo}</Text>
          <Text style={{ width: COLS.nombre }}>{a.nombre}</Text>
          <Text style={{ width: COLS.tipo }}>{a.tipo}</Text>
          <Text style={{ width: COLS.marca }}>{a.marca ?? '—'}</Text>
          <Text style={{ width: COLS.serie }}>{a.serie ?? '—'}</Text>
          <Text style={{ width: COLS.valor, textAlign: 'right' }}>{a.valor != null ? fmtCOP(a.valor) : '—'}</Text>
        </View>
      ))}
      {/* El total solo tiene sentido si al menos un activo trae valor. */}
      {hayValores && varios && (
        <View style={[estilos.fila, { borderBottomWidth: 0 }]}>
          <Text style={{ width: '88%', textAlign: 'right', ...estilos.negrita }}>Total</Text>
          <Text style={{ width: COLS.valor, textAlign: 'right', ...estilos.negrita }}>{fmtCOP(total)}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * El texto (título y párrafos alrededor de la tabla) viene de Ajustes →
 * Plantillas de documentos (claves ACTA_ACTIVO_ENTREGA / ACTA_ACTIVO_DEVOLUCION);
 * aquí solo se pone la hoja: membrete, tabla, firmas y pie.
 */
function Doc({ d, texto }: { d: DatosActaActivo; texto: TextoResuelto }) {
  return (
    <Document>
      <Page size="LETTER" style={estilos.page}>
        <Membrete empresa={d.empresa} />
        <Text style={estilos.titulo}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} tabla={<TablaActivos activos={d.activos} />} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 56 }} wrap={false}>
          <View style={estilos.firmaLinea}>
            {d.firmaDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={d.firmaDataUri} style={{ width: 120, height: 48, objectFit: 'contain' }} />
            ) : null}
            <Text>{d.colaborador.nombre}</Text>
            <Text style={{ fontSize: 8 }}>
              Colaborador{d.firmaDataUri && d.firmaFecha ? ` · firmado digitalmente el ${formatFechaLarga(d.firmaFecha)}` : ''}
            </Text>
          </View>
          <View style={estilos.firmaLinea}><Text>Talento Humano</Text><Text style={{ fontSize: 8 }}>{d.empresa.nombreComercial}</Text></View>
        </View>
        <NotasPdf notas={texto.notas} />
        <Pie texto={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} />
      </Page>
    </Document>
  )
}

/** Renderiza el acta con el texto vigente de Ajustes, salvo que se pase `plantilla` (muestras). */
export async function renderActaActivo(d: DatosActaActivo, plantilla?: PlantillaTexto): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto(d.tipo === 'entrega' ? 'ACTA_ACTIVO_ENTREGA' : 'ACTA_ACTIVO_DEVOLUCION'))
  return renderToBuffer(<Doc d={d} texto={resolverTexto(texto, variablesActaActivo(d))} />)
}

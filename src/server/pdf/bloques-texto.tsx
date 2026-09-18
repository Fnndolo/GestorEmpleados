import type { ReactNode } from 'react'
import { Page, Text, View, Svg, Path, StyleSheet, type Styles } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { Membrete, MembreteFondo, Pie, type DatosEmpresa } from './membrete'
import { fondoMembrete } from './fondo-membrete'
import { conTablaImplicita, type BloqueTexto } from '@/lib/plantillas-documento/textos'
import type { Tramo } from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Piezas compartidas por los PDF con texto editable (actas de Mis entregas,
 * orden de pago de horas extra, certificaciones): la hoja —con el papel
 * membretado de Ajustes o con un encabezado sencillo, según lo elegido en el
 * editor— y el cuerpo (párrafos, listas y la tabla que arma la app en el sitio
 * de `[tabla]`) tal como lo devuelve `resolverTexto`. La firma la pone cada
 * documento.
 */

/** Márgenes según lleve o no el fondo: el membrete ocupa ~118pt arriba y ~64pt abajo. */
const CON_MEMBRETE = { paddingTop: 122, paddingBottom: 96 }
const SIN_MEMBRETE = { paddingTop: 48, paddingBottom: 64 }

/**
 * Hoja carta del documento. Con membrete va el fondo de página completa (y el
 * pie de contacto lo trae el propio membrete); sin él, el encabezado sencillo
 * con la empresa y el NIT, y el pie de texto abajo.
 */
export function HojaTexto({ empresa, membrete, fondo, pie, estilo, children }: {
  empresa: DatosEmpresa
  membrete: boolean
  /** Membrete propio de la empresa como data URI (`fondoParaTexto`); sin él, el de fábrica. */
  fondo?: string
  /** Texto del pie cuando NO hay membrete. */
  pie: string
  /** Ajustes de página propios del documento (tamaño de letra, por ejemplo). */
  estilo?: Styles[string]
  children: ReactNode
}) {
  return (
    <Page size="LETTER" style={[estilos.page, estilo ?? {}, membrete ? CON_MEMBRETE : SIN_MEMBRETE]}>
      {membrete ? <MembreteFondo fondo={fondo} empresa={empresa} /> : <Membrete empresa={empresa} />}
      {children}
      {!membrete && <Pie texto={pie} />}
    </Page>
  )
}

/** El membrete propio de la empresa (si lo hay) solo cuando el documento lo va a usar. */
export async function fondoParaTexto(usaMembrete: boolean): Promise<string | undefined> {
  if (!usaMembrete) return undefined
  const { src, propio } = await fondoMembrete()
  return propio ? src : undefined
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', marginBottom: 6, paddingLeft: 14 },
  itemMarca: { width: 16 },
  itemCheck: { width: 16, paddingTop: 3.5 },
  itemTexto: { flex: 1, textAlign: 'justify' },
  subrayado: { textDecoration: 'underline' },
  nota: { marginTop: 18, fontSize: 8, color: '#64748b', textAlign: 'center' },
})

export function TramosPdf({ tramos }: { tramos: Tramo[] }) {
  return (
    <>
      {tramos.map((t, j) => (
        <Text key={j} style={[t.negrita ? estilos.negrita : {}, t.subrayado ? s.subrayado : {}]}>{t.texto}</Text>
      ))}
    </>
  )
}

function Marcador({ vineta }: { vineta: string }) {
  if (vineta !== '✓') return <Text style={s.itemMarca}>{vineta}</Text>
  // Helvetica no trae el glifo ✓: se dibuja como vector.
  return (
    <View style={s.itemCheck}>
      <Svg width={9} height={9} viewBox="0 0 24 24">
        <Path d="M20 6 9 17l-5-5" stroke="#0f172a" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  )
}

export function BloquesPdf({ bloques, tabla }: { bloques: BloqueTexto[]; tabla?: ReactNode }) {
  const lista = tabla ? conTablaImplicita(bloques) : bloques.filter((b) => b.tipo !== 'tabla')
  return (
    <>
      {lista.map((b, i) => {
        if (b.tipo === 'tabla') return <View key={i}>{tabla}</View>
        const p = b.parrafo
        return p.vineta ? (
          <View key={i} style={s.item}>
            <Marcador vineta={p.vineta} />
            <Text style={s.itemTexto}><TramosPdf tramos={p.tramos} /></Text>
          </View>
        ) : (
          <Text key={i} style={estilos.parrafo}><TramosPdf tramos={p.tramos} /></Text>
        )
      })}
    </>
  )
}

/** Las notas `~ ` en letra pequeña, debajo de la firma. */
export function NotasPdf({ notas }: { notas: Tramo[][] }) {
  return (
    <>
      {notas.map((n, i) => (
        <Text key={i} style={s.nota}><TramosPdf tramos={n} /></Text>
      ))}
    </>
  )
}

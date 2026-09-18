import type { ReactNode } from 'react'
import { Text, View, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { estilos } from './estilos'
import { conTablaImplicita, type BloqueTexto } from '@/lib/plantillas-documento/textos'
import type { Tramo } from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Pinta en un PDF (Helvetica) el texto editable de un documento —párrafos,
 * listas y la tabla que arma la app en el sitio de `[tabla]`— tal como lo
 * devuelve `resolverTexto`. La hoja, la cabecera, la firma y el pie los pone
 * cada documento; esto es solo el cuerpo.
 */

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

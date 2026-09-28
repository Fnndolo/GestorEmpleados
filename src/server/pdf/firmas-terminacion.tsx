import { Text, View, Image } from '@react-pdf/renderer'
import { formatFechaLarga } from '@/lib/fechas'

/** Una firma electrónica ya aplicada (PNG + cuándo). */
export type FirmaAplicada = { dataUri: string; fecha: Date }

/**
 * Firmas de los documentos de la terminación: Talento Humano (por la empresa)
 * y el trabajador. Cada firma va ENCIMA de su línea, en un espacio reservado de
 * alto fijo: así el documento sin firmar y el firmado tienen la misma forma.
 * Con `null` en una de las dos partes, solo va la otra (la carta de renuncia la
 * firma solo el trabajador; la orden de examen, solo la empresa).
 */
export function FirmasTerminacion({ empresa, trabajador }: {
  empresa: { razonSocial: string; firmante: string | null; firma: FirmaAplicada | null } | null
  trabajador: { nombre: string; documento: string; firma: FirmaAplicada | null } | null
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }} wrap={false}>
      {empresa && (
        <Firma
          firma={empresa.firma}
          nombre={empresa.firmante ?? 'Talento Humano'}
          detalle={`Talento Humano · ${empresa.razonSocial}`}
        />
      )}
      {trabajador && <Firma firma={trabajador.firma} nombre={trabajador.nombre} detalle={`Trabajador(a) · ${trabajador.documento}`} />}
    </View>
  )
}

function Firma({ firma, nombre, detalle }: { firma: FirmaAplicada | null; nombre: string; detalle: string }) {
  return (
    <View style={{ width: 230 }}>
      <View style={{ height: 46, justifyContent: 'flex-end' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {firma && <Image src={firma.dataUri} style={{ width: 130, height: 44, objectFit: 'contain' }} />}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 4 }}>
        <Text>{nombre}</Text>
        <Text style={{ fontSize: 8, color: '#475569' }}>{detalle}</Text>
        {firma && <Text style={{ fontSize: 7.5, color: '#64748b', marginTop: 1 }}>Firmado electrónicamente el {formatFechaLarga(firma.fecha)}</Text>}
      </View>
    </View>
  )
}

import { Document, Text, renderToBuffer } from '@react-pdf/renderer'
import { estilos } from './estilos'
import type { DatosEmpresa } from './membrete'
import { BloquesPdf, HojaTexto, NotasPdf, fondoParaTexto } from './bloques-texto'
import { FirmasTerminacion, type FirmaAplicada } from './firmas-terminacion'
import { plantillaTexto } from '@/server/plantillas-documento'
import { resolverTexto, variablesCarta, type ClaveTexto, type TextoDocumento, type TextoResuelto } from '@/lib/plantillas-documento/textos'
import { FIRMAS_TEXTO } from '@/lib/terminaciones/cartas'

export type DatosCartaPdf = {
  empresa: DatosEmpresa
  colaborador: { nombre: string; documento: string; cargo: string | null }
  ciudad: string
  fecha: Date
  fechaIngreso: Date
  fechaRetiro: Date
  motivo: string
  observaciones: string | null
  preavisoDias: number | null
  destinatario?: { correo: string | null; lugarExpedicion: string | null; departamento: string | null }
  ciudadEmpresa?: string | null
  firmante?: string | null
  firmaEmpresa?: FirmaAplicada | null
  firmaTrabajador?: FirmaAplicada | null
}

/**
 * Cartas de la terminación (renuncia, aceptación, terminación, no prórroga,
 * mutuo acuerdo) y la orden del examen de egreso: todo el texto viene de
 * Ajustes → Plantillas de documentos; aquí solo va la hoja y las firmas que
 * lleve cada documento (`FIRMAS_TEXTO`).
 */
function Doc({ clave, d, texto, membrete, fondo }: { clave: ClaveTexto; d: DatosCartaPdf; texto: TextoResuelto; membrete: boolean; fondo?: string }) {
  const firmas = FIRMAS_TEXTO[clave] ?? 'ambas'
  return (
    <Document>
      {/* Formato de carta: letra y aire de un documento de Word, para que el
          texto y las firmas quepan en una sola hoja. */}
      <HojaTexto empresa={d.empresa} membrete={membrete} fondo={fondo} pie={`${d.empresa.razonSocial} · NIT ${d.empresa.nit}`} estilo={{ fontSize: 10 }}>
        <Text style={[estilos.titulo, { marginBottom: 14 }]}>{texto.titulo.toUpperCase()}</Text>
        <BloquesPdf bloques={texto.bloques} compacto />
        <FirmasTerminacion
          empresa={firmas === 'trabajador' ? null : { razonSocial: d.empresa.razonSocial, firmante: d.firmante ?? null, firma: d.firmaEmpresa ?? null }}
          trabajador={firmas === 'empresa' ? null : { nombre: d.colaborador.nombre, documento: d.colaborador.documento, firma: d.firmaTrabajador ?? null }}
        />
        <NotasPdf notas={texto.notas} />
      </HojaTexto>
    </Document>
  )
}

export async function renderCartaTerminacion(clave: ClaveTexto, d: DatosCartaPdf, plantilla?: TextoDocumento): Promise<Buffer> {
  const texto = plantilla ?? (await plantillaTexto(clave))
  const fondo = await fondoParaTexto(texto.usaMembrete)
  return renderToBuffer(<Doc clave={clave} d={d} texto={resolverTexto(texto, variablesCarta(d))} membrete={texto.usaMembrete} fondo={fondo} />)
}

import 'server-only'
import { obtenerArchivoAdjunto } from '@/server/archivos-temporales'
import { esComprimido } from '@/lib/archivos'
import { createHash } from 'node:crypto'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'

/**
 * Guarda la autorización de tratamiento de datos (Ley 1581) firmada en FÍSICO que
 * acompaña a un contrato subido desde la ficha del colaborador. Es opcional: si no
 * se adjunta PDF, no hace nada. El archivo llega como data URI base64, igual que el
 * PDF del contrato.
 */
export async function guardarAutorizacionSubida({
  autorizacionBase64, autorizacionRef, entidadTipo, entidadId, numero, sedeId, usuarioId,
}: {
  autorizacionBase64?: string | null
  autorizacionRef?: string | null
  entidadTipo: 'Contrato' | 'ContratoOps'
  entidadId: string
  numero: string
  sedeId: string | null
  usuarioId: string
}): Promise<string | null> {
  if (!autorizacionBase64 && !autorizacionRef) return null

  const adjunto = await obtenerArchivoAdjunto(
    { pdfBase64: autorizacionBase64, pdfRef: autorizacionRef }, usuarioId, 'El archivo de la autorización de datos está vacío.',
  )
  const pdf = adjunto.contenido
  const comprimido = esComprimido(adjunto.mimeType)

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const extension = comprimido ? (adjunto.nombre?.split('.').pop() ?? 'zip').toLowerCase() : 'pdf'
  const archivo = await subirArchivo(
    `contratos/${entidadId}`, `autorizacion-datos-${numero}.${extension}`, pdf, adjunto.mimeType,
  )
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo,
      entidadId,
      nombre: `Autorización de datos ${numero}${comprimido ? ' (comprimido)' : ''}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: adjunto.mimeType,
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId,
      subidoPorId: usuarioId,
    },
  })
  return doc.id
}

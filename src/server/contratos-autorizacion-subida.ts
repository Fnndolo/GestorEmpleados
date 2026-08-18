import 'server-only'
import { createHash } from 'node:crypto'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { ErrorNegocio } from '@/server/accion'

/**
 * Guarda la autorización de tratamiento de datos (Ley 1581) firmada en FÍSICO que
 * acompaña a un contrato subido desde la ficha del colaborador. Es opcional: si no
 * se adjunta PDF, no hace nada. El archivo llega como data URI base64, igual que el
 * PDF del contrato.
 */
export async function guardarAutorizacionSubida({
  autorizacionBase64, entidadTipo, entidadId, numero, sedeId, usuarioId,
}: {
  autorizacionBase64?: string | null
  entidadTipo: 'Contrato' | 'ContratoOps'
  entidadId: string
  numero: string
  sedeId: string | null
  usuarioId: string
}): Promise<string | null> {
  if (!autorizacionBase64) return null

  const base64 = autorizacionBase64.split(',')[1] ?? ''
  const pdf = Buffer.from(base64, 'base64')
  if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF de la autorización de datos está vacío.')

  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(
    `contratos/${entidadId}`, `autorizacion-datos-${numero}.pdf`, pdf, 'application/pdf',
  )
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo,
      entidadId,
      nombre: `Autorización de datos ${numero}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId,
      subidoPorId: usuarioId,
    },
  })
  return doc.id
}

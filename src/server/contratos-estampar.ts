import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { ErrorNegocio } from '@/server/accion'
import { estamparFirmasEnPdf, type PosicionFirma } from '@/server/pdf/firma-en-pdf'
import type { PdfGenerado } from '@/server/contratos-ops-pdf'

/**
 * Cierre de la firma para contratos cuyo PDF se subió (`SUBIDO_PARA_FIRMA`),
 * sean OPS o laborales.
 *
 * El camino normal regenera el documento desde la plantilla e incrusta las
 * firmas al renderizar. Aquí no hay plantilla: el PDF aportado ES el contrato,
 * así que se toma el archivo original y se le dibujan las firmas encima, en las
 * posiciones que un humano confirmó al subirlo.
 *
 * El original nunca se pisa: el resultado se guarda como un Documento nuevo, de
 * modo que siempre se pueda comparar lo firmado contra lo que se subió.
 */
export async function generarPdfContratoEstampado(opts: {
  /** Qué tabla es el contrato: decide a quién se cuelga el Documento. */
  entidadTipo: 'ContratoOps' | 'Contrato'
  /** Carpeta de storage del contrato (`contratos-ops/<id>` o `contratos/<id>`). */
  carpeta: string
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  /** Documento del PDF tal como se subió: la base sobre la que se estampa. */
  documentoOriginalId: string
  firmas: { posicion: PosicionFirma; imagenDataUri: string }[]
  nombreDocumento: string
}): Promise<PdfGenerado> {
  const original = await prisma.documento.findUnique({
    where: { id: opts.documentoOriginalId },
    select: { storagePath: true },
  })
  if (!original) throw new ErrorNegocio('No se encontró el PDF original del contrato para estampar las firmas.')

  const pdfOriginal = await leerArchivo(original.storagePath)
  const firmado = await estamparFirmasEnPdf({ pdfOriginal, firmas: opts.firmas })

  const sha256 = createHash('sha256').update(firmado).digest('hex')
  const archivo = await subirArchivo(opts.carpeta, `contrato-${opts.numero}-firmado.pdf`, firmado, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: opts.entidadTipo,
      entidadId: opts.contratoId,
      nombre: opts.nombreDocumento,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: opts.sedeId,
      subidoPorId: opts.usuarioId,
    },
  })
  return { documentoId: doc.id, sha256 }
}

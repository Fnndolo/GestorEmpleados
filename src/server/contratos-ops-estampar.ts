import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { ErrorNegocio } from '@/server/accion'
import { estamparFirmasEnPdf, type PosicionFirma } from '@/server/pdf/firma-en-pdf'
import type { PdfGenerado } from '@/server/contratos-ops-pdf'

/**
 * Cierre de la firma para contratos OPS cuyo PDF se subió (`SUBIDO_PARA_FIRMA`).
 *
 * El camino normal regenera el documento desde la plantilla e incrusta las
 * firmas al renderizar. Aquí no hay plantilla: el PDF aportado ES el contrato,
 * así que se toma el archivo original y se le dibujan las firmas encima, en las
 * posiciones que un humano confirmó al subirlo.
 *
 * El original nunca se pisa: el resultado se guarda como un Documento nuevo, de
 * modo que siempre se pueda comparar lo firmado contra lo que se subió.
 */

/** Contenido de `ContratoOps.posicionFirmas`. */
export type DatosFirmaSubido = {
  contratista: PosicionFirma
  contratante: PosicionFirma
  /** Documento del PDF tal como se subió: es la base sobre la que se estampa. */
  documentoOriginalId: string
}

/** Lee y valida el JSON de posiciones; sin él no hay forma de saber dónde firmar. */
export function leerDatosFirmaSubido(valor: unknown): DatosFirmaSubido {
  const d = valor as DatosFirmaSubido | null
  if (!d?.contratista || !d?.contratante || !d?.documentoOriginalId) {
    throw new ErrorNegocio(
      'Este contrato no tiene registrada la posición de las firmas dentro del PDF. Vuelve a subirlo indicando dónde firma cada parte.',
    )
  }
  return d
}

/**
 * Estampa ambas firmas sobre el PDF original y guarda el resultado como
 * Documento del contrato.
 */
export async function generarPdfContratoOpsEstampado(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosFirmaSubido
  firmaContratistaImg: string
  firmaContratanteImg: string
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const original = await prisma.documento.findUnique({
    where: { id: opts.datos.documentoOriginalId },
    select: { storagePath: true },
  })
  if (!original) throw new ErrorNegocio('No se encontró el PDF original del contrato para estampar las firmas.')

  const pdfOriginal = await leerArchivo(original.storagePath)
  const firmado = await estamparFirmasEnPdf({
    pdfOriginal,
    firmas: [
      { posicion: opts.datos.contratista, imagenDataUri: opts.firmaContratistaImg },
      { posicion: opts.datos.contratante, imagenDataUri: opts.firmaContratanteImg },
    ],
  })

  const sha256 = createHash('sha256').update(firmado).digest('hex')
  const archivo = await subirArchivo(
    `contratos-ops/${opts.contratoId}`,
    `contrato-${opts.numero}-firmado.pdf`,
    firmado,
    'application/pdf',
  )
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'ContratoOps',
      entidadId: opts.contratoId,
      nombre: opts.nombreDocumento ?? `Contrato OPS ${opts.numero} (firmado)`,
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

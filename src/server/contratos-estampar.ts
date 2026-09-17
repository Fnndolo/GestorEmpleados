import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { eliminarDocumento } from '@/server/documentos'
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

/** Método con que se marca en el rastro una corrección de posición (no es una firma). */
export const METODO_CORRECCION_POSICION = 'CORRECCION_POSICION'

/**
 * Cierre de una corrección de posición, común a OPS y laboral: se llama después
 * de volver a estampar. Elimina el PDF "(firmado)" anterior para que no circulen
 * dos versiones y deja en el rastro de firma una entrada propia con el hash del
 * documento nuevo. Así la cadena de huellas sigue completa: la firma original
 * apunta al PDF viejo; la corrección, al que lo reemplaza.
 */
export async function cerrarCorreccionPosicion(opts: {
  entidadTipo: 'ContratoOps' | 'Contrato'
  contratoId: string
  documentoOriginalId: string
  nuevo: PdfGenerado
  /** Parte cuya firma se movió; el rastro exige un rol aunque no sea una firma. */
  rol: 'CONTRATISTA' | 'EMPLEADO'
  usuarioId: string
}): Promise<void> {
  // Fuera el estampado anterior: todo PDF del contrato que no sea el original
  // subido ni una autorización de datos es una versión firmada vieja.
  const docs = await prisma.documento.findMany({
    where: { entidadTipo: opts.entidadTipo, entidadId: opts.contratoId, id: { notIn: [opts.documentoOriginalId, opts.nuevo.documentoId] } },
    select: { id: true, nombre: true },
  })
  for (const d of docs) {
    if (esAutorizacion(d.nombre)) continue
    await eliminarDocumento(d.id)
  }

  const ctx = contextoActual()
  const userAgent = (await headers()).get('user-agent')
  await prisma.evidenciaFirmaContrato.create({
    data: {
      ...(opts.entidadTipo === 'ContratoOps' ? { contratoOpsId: opts.contratoId } : { contratoId: opts.contratoId }),
      rol: opts.rol,
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: userAgent ?? null,
      metodoAuth: METODO_CORRECCION_POSICION,
      documentos: [{ tipo: 'CONTRATO', documentoId: opts.nuevo.documentoId, sha256: opts.nuevo.sha256 }],
      firmadoEn: new Date(),
    },
  })
}

/** Sin acentos y en minúsculas: los nombres viejos no son de fiar. */
function esAutorizacion(nombre: string) {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('autoriz')
}

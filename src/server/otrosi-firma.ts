import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { estamparFirmasEnPdf, type PosicionFirma } from '@/server/pdf/firma-en-pdf'
import { avisarPorRol } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { resumenOtrosi, type ValoresOtrosi } from '@/lib/otrosi'

/**
 * Firma del trabajador sobre un otrosí, con la misma lógica del contrato subido
 * para firmar: el PDF que se subió al registrar el otrosí ES el documento, y la
 * firma se estampa encima en la posición que Talento Humano confirmó.
 *
 * El original nunca se pisa: el firmado se guarda como un Documento nuevo y el
 * otrosí pasa a apuntar a él (`documentoId`), conservando `documentoOriginalId`
 * para poder comparar lo firmado contra lo que se subió.
 *
 * Solo firma el trabajador: se asume que el PDF ya viene firmado por la empresa,
 * como ocurre con un contrato que llega "ya firmado por el representante legal".
 *
 * El llamador valida permisos y pertenencia (y el código OTP, si aplica).
 */
export async function aplicarFirmaOtrosi(opts: {
  otrosiId: string
  firmaDataUri: string
  usuarioId: string
  metodoAuth?: string
}): Promise<{ numero: number; contratoId: string; contratoNumero: string }> {
  const o = await prisma.otrosiContrato.findUniqueOrThrow({
    where: { id: opts.otrosiId },
    include: {
      contrato: {
        select: { id: true, numero: true, sedeId: true, colaborador: { select: { nombres: true, apellidos: true } } },
      },
    },
  })
  if (!o.requiereFirma) throw new ErrorNegocio('Este otrosí no se firma en la app.')
  if (o.firmaEmpleadoPath) throw new ErrorNegocio('Este otrosí ya está firmado.')
  const posicion = o.posicionFirma as PosicionFirma | null
  if (!o.documentoOriginalId || !posicion) {
    throw new ErrorNegocio('Este otrosí no tiene registrada la posición de la firma dentro del PDF. Pide a Talento Humano que lo registre de nuevo.')
  }

  const base64 = opts.firmaDataUri.split(',')[1] ?? ''
  const png = Buffer.from(base64, 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')

  const original = await prisma.documento.findUnique({
    where: { id: o.documentoOriginalId },
    select: { storagePath: true },
  })
  if (!original) throw new ErrorNegocio('No se encontró el PDF del otrosí para estampar la firma.')

  const carpeta = `contratos/${o.contratoId}/otrosi-${o.numero}`
  const firma = await subirArchivo(carpeta, 'firma-empleado.png', png, 'image/png')
  const ahora = new Date()

  // El PDF firmado: el original más la firma en la posición confirmada.
  const pdfOriginal = await leerArchivo(original.storagePath)
  const firmado = await estamparFirmasEnPdf({ pdfOriginal, firmas: [{ posicion, imagenDataUri: opts.firmaDataUri }] })
  const sha256 = createHash('sha256').update(firmado).digest('hex')
  const archivo = await subirArchivo(carpeta, `otrosi-${o.numero}-firmado.pdf`, firmado, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      // Entidad propia: si colgara del contrato, la ficha lo tomaría por el PDF
      // del contrato (elige el documento más reciente que no sea la autorización).
      entidadTipo: 'OtrosiContrato',
      entidadId: o.id,
      nombre: `Otrosí ${o.numero} del contrato ${o.contrato.numero} (firmado)`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: o.contrato.sedeId,
      subidoPorId: opts.usuarioId,
    },
  })

  await dbAuditado.otrosiContrato.update({
    where: { id: o.id },
    data: {
      documentoId: doc.id,
      firmaEmpleadoPath: firma.storagePath,
      firmaEmpleadoFecha: ahora,
      firmaEmpleadoPorId: opts.usuarioId,
    },
  })

  // Rastro probatorio del acto de firma (Ley 527), en BD y no dentro del PDF:
  // igual que en el contrato, pero señalando además el otrosí.
  const ctx = contextoActual()
  const userAgent = (await headers()).get('user-agent')
  await prisma.evidenciaFirmaContrato.create({
    data: {
      contratoId: o.contratoId,
      otrosiId: o.id,
      rol: 'EMPLEADO',
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: userAgent ?? null,
      metodoAuth: opts.metodoAuth ?? 'SESION',
      documentos: [{ tipo: 'OTROSI', documentoId: doc.id, sha256 }],
      firmadoEn: ahora,
    },
  })

  const nombre = nombreCorto(o.contrato.colaborador.nombres, o.contrato.colaborador.apellidos)
  const resumen = resumenOtrosi(o.tiposCambio, o.valoresNuevos as ValoresOtrosi | null)
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    titulo: `${nombre} firmó el otrosí ${o.numero}`,
    mensaje: `Contrato ${o.contrato.numero}${resumen ? ` · ${resumen}` : ''} · El PDF firmado ya está en el contrato.`,
    enlace: `/contratos/${o.contratoId}`,
    llamadoAccion: 'Ver el contrato',
    evento: 'contrato_firmado',
  }).catch(() => {})

  return { numero: o.numero, contratoId: o.contratoId, contratoNumero: o.contrato.numero }
}

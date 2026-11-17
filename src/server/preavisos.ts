import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { eliminarDocumento } from '@/server/documentos'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { formatFechaCorta } from '@/lib/fechas'
import { Prisma } from '@/generated/prisma/client'
import { headers } from 'next/headers'
import { leerArchivo } from '@/server/storage'
import { contextoActual } from '@/server/contexto'
import { agregarConstancia } from '@/server/descuentos-acuerdo'
import { estamparFirmasEnPdf, type PosicionFirma } from '@/server/pdf/firma-en-pdf'

/**
 * Documento para firmar por fuera: preaviso de un contrato laboral (Contratos →
 * Acciones → Enviar preaviso), documento de un contrato OPS o de una terminación.
 *
 * No se firma en la app: Talento Humano sube el PDF, la persona lo descarga en
 * su autoservicio, lo firma o llena por fuera y sube el PDF de vuelta.
 */

/** Entidad de los dos PDF del preaviso: el que se envía y el que devuelve la persona. */
export const ENTIDAD_PREAVISO = 'PreavisoContrato'

async function guardarPdf(preavisoId: string, colaboradorId: string, nombre: string, pdf: Buffer, usuarioId: string) {
  const archivo = await subirArchivo(`colaboradores/${colaboradorId}/preavisos`, `preaviso-${preavisoId}-${Date.now()}.pdf`, pdf, 'application/pdf')
  return dbAuditado.documento.create({
    data: {
      entidadTipo: ENTIDAD_PREAVISO,
      entidadId: preavisoId,
      nombre,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256: createHash('sha256').update(pdf).digest('hex'),
      nivelAcceso: 'GENERAL',
      subidoPorId: usuarioId,
    },
  })
}

export async function enviarPreaviso(opts: {
  /** Contrato laboral; o bien `contratoOpsId` para un contrato OPS. */
  contratoId?: string
  contratoOpsId?: string
  terminacionId?: string
  nombre: string
  mensaje: string | null
  pdf: Buffer
  usuarioId: string
  /** Firmarlo dentro de la app; `posicionFirma` dice dónde va la firma. */
  firmaEnApp?: boolean
  posicionFirma?: PosicionFirma | null
}) {
  const c = opts.contratoOpsId
    ? await prisma.contratoOps.findUnique({ where: { id: opts.contratoOpsId }, select: { colaboradorId: true, numero: true } })
    : await prisma.contrato.findUnique({ where: { id: opts.contratoId ?? '' }, select: { colaboradorId: true, numero: true } })
  if (!c) throw new ErrorNegocio('El contrato ya no existe.')
  if (!c.colaboradorId) throw new ErrorNegocio('El contratista no tiene ficha en la plataforma: créala para que pueda recibir y firmar el documento en su autoservicio.')
  const colaboradorId = c.colaboradorId

  const id = crypto.randomUUID()
  const doc = await guardarPdf(id, colaboradorId, `${opts.nombre} · Contrato ${c.numero}`, opts.pdf, opts.usuarioId)
  await dbAuditado.preavisoContrato.create({
    data: {
      id,
      colaboradorId,
      contratoId: opts.contratoId ?? null,
      contratoOpsId: opts.contratoOpsId ?? null,
      terminacionId: opts.terminacionId ?? null,
      nombre: opts.nombre,
      mensaje: opts.mensaje,
      documentoId: doc.id,
      enviadoPorId: opts.usuarioId,
      firmaEnApp: opts.firmaEnApp ?? false,
      posicionFirma: opts.firmaEnApp && opts.posicionFirma ? opts.posicionFirma : Prisma.DbNull,
    },
  })

  const uid = await usuarioDeColaborador(colaboradorId)
  if (uid) {
    await avisar(uid, {
      evento: 'contrato_por_firmar',
      titulo: opts.firmaEnApp ? `Firma el documento: ${opts.nombre}` : `Tienes un documento por devolver: ${opts.nombre}`,
      mensaje: opts.mensaje || (opts.firmaEnApp ? 'Revísalo y fírmalo en Mis contratos.' : 'Descárgalo en Mis contratos, fírmalo o llénalo y vuelve a subir el PDF.'),
      enlace: '/autoservicio/contratos',
      llamadoAccion: opts.firmaEnApp ? 'Revisar y firmar' : 'Ver el documento',
      colaboradorId,
    }).catch(() => {})
  }
  return { colaboradorId: colaboradorId }
}

/** La persona sube el PDF firmado. Puede reemplazarlo mientras quiera: queda el último. */
export async function responderPreaviso(opts: { preavisoId: string; colaboradorId: string; pdf: Buffer; usuarioId: string }) {
  const p = await prisma.preavisoContrato.findUnique({ where: { id: opts.preavisoId } })
  if (!p || p.colaboradorId !== opts.colaboradorId) throw new ErrorNegocio('Este documento no es tuyo.')
  if (p.firmaEnApp) throw new ErrorNegocio('Este documento se firma aquí en la app: usa «Revisar y firmar».')

  const doc = await guardarPdf(p.id, p.colaboradorId, `${p.nombre} (firmado)`, opts.pdf, opts.usuarioId)
  await dbAuditado.preavisoContrato.update({ where: { id: p.id }, data: { respuestaDocId: doc.id, respondidoEn: new Date() } })
  if (p.respuestaDocId) await eliminarDocumento(p.respuestaDocId).catch(() => {})

  const col = await prisma.colaborador.findUnique({ where: { id: p.colaboradorId }, select: { nombres: true, apellidos: true } })
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'contrato_firmado',
    titulo: `${col ? nombreCorto(col.nombres, col.apellidos) : 'Un colaborador'} devolvió firmado: ${p.nombre}`,
    mensaje: 'El PDF ya está en el contrato.',
    colaboradorId: p.colaboradorId,
    enlace: p.terminacionId ? `/terminaciones/${p.terminacionId}` : p.contratoOpsId ? `/contratos/ops/${p.contratoOpsId}` : `/contratos/${p.contratoId}`,
  }).catch(() => {})
}

/** Quitar un preaviso enviado por error, con sus dos PDF. */
export async function quitarPreaviso(id: string) {
  const p = await prisma.preavisoContrato.findUnique({ where: { id } })
  if (!p) throw new ErrorNegocio('El preaviso ya no existe.')
  await dbAuditado.preavisoContrato.delete({ where: { id } })
  await eliminarDocumento(p.documentoId).catch(() => {})
  if (p.respuestaDocId) await eliminarDocumento(p.respuestaDocId).catch(() => {})
  return p
}

/** Los preavisos listos para mostrar (contrato o autoservicio), el más reciente primero. */
export async function listarPreavisos(where: Prisma.PreavisoContratoWhereInput) {
  const filas = await prisma.preavisoContrato.findMany({ where, orderBy: { creadoEn: 'desc' } })
  return filas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    mensaje: p.mensaje,
    documentoId: p.documentoId,
    respuestaDocId: p.respuestaDocId,
    enviado: formatFechaCorta(p.creadoEn),
    respondido: p.respondidoEn ? formatFechaCorta(p.respondidoEn) : null,
    firmaEnApp: p.firmaEnApp,
    contratoId: p.contratoId,
  }))
}

/** Corregir un preaviso ya enviado: nombre, mensaje y, si se da, el PDF. */
export async function editarPreaviso(opts: { id: string; nombre: string; mensaje: string | null; pdf: Buffer | null; usuarioId: string }) {
  const p = await prisma.preavisoContrato.findUnique({ where: { id: opts.id } })
  if (!p) throw new ErrorNegocio('El preaviso ya no existe.')
  let documentoId = p.documentoId
  if (opts.pdf) {
    const doc = await guardarPdf(p.id, p.colaboradorId, opts.nombre, opts.pdf, opts.usuarioId)
    documentoId = doc.id
  }
  await dbAuditado.preavisoContrato.update({ where: { id: p.id }, data: { nombre: opts.nombre, mensaje: opts.mensaje, documentoId } })
  if (documentoId !== p.documentoId) await eliminarDocumento(p.documentoId).catch(() => {})
  return p
}

/** El documento es de la persona, se firma en la app y aún no lo ha firmado. */
export async function preavisoPorFirmar(preavisoId: string, colaboradorId: string | null) {
  if (!colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  const p = await prisma.preavisoContrato.findUnique({ where: { id: preavisoId } })
  if (!p || p.colaboradorId !== colaboradorId) throw new ErrorNegocio('Este documento no es tuyo.')
  if (!p.firmaEnApp) throw new ErrorNegocio('Este documento se firma por fuera: descárgalo y sube el PDF firmado.')
  if (p.respondidoEn) throw new ErrorNegocio('Ya firmaste este documento.')
  return p
}

/**
 * Firma en la app: la firma se dibuja donde se marcó y se agrega una hoja de
 * constancia (quién, cuándo, desde dónde y la huella del original; Ley 527).
 */
export async function firmarPreavisoEnApp(opts: { preavisoId: string; firmaDataUri: string; usuarioId: string; metodoAuth: string }) {
  const p = await prisma.preavisoContrato.findUniqueOrThrow({ where: { id: opts.preavisoId } })
  if (p.respondidoEn) throw new ErrorNegocio('Este documento ya está firmado.')
  const col = await prisma.colaborador.findUniqueOrThrow({ where: { id: p.colaboradorId }, select: { nombres: true, apellidos: true, numeroDocumento: true } })
  const png = Buffer.from(opts.firmaDataUri.split(',')[1] ?? '', 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const archivoFirma = await subirArchivo(`colaboradores/${p.colaboradorId}/preavisos/firmas`, `firma-${p.id}.png`, png, 'image/png')

  const original = await prisma.documento.findUniqueOrThrow({ where: { id: p.documentoId } })
  const pdfOriginal = await leerArchivo(original.storagePath)
  const ahora = new Date()
  const ctx = contextoActual()
  const nombre = `${col.nombres} ${col.apellidos}`
  const posicion = p.posicionFirma as PosicionFirma | null
  const conFirma = posicion ? await estamparFirmasEnPdf({ pdfOriginal, firmas: [{ posicion, imagenDataUri: opts.firmaDataUri }] }) : pdfOriginal
  const numero = p.contratoOpsId
    ? (await prisma.contratoOps.findUnique({ where: { id: p.contratoOpsId }, select: { numero: true } }))?.numero
    : p.contratoId ? (await prisma.contrato.findUnique({ where: { id: p.contratoId }, select: { numero: true } }))?.numero : null
  const pdf = await agregarConstancia(conFirma, {
    png, nombre, documento: col.numeroDocumento, fecha: ahora,
    asunto: p.nombre, detalle: numero ? `Documento del contrato ${numero}` : 'Documento del contrato',
    subtitulo: 'Documento del contrato · firma electrónica',
    ip: ctx.ip, correo: ctx.userEmail, huellaOriginal: original.sha256 ?? createHash('sha256').update(pdfOriginal).digest('hex'),
  })
  const doc = await guardarPdf(p.id, p.colaboradorId, `${p.nombre} (firmado)`, pdf, opts.usuarioId)
  await dbAuditado.preavisoContrato.update({ where: { id: p.id }, data: { respuestaDocId: doc.id, respondidoEn: ahora, firmaPath: archivoFirma.storagePath } })
  await prisma.evidenciaFirmaContrato.create({
    data: {
      contratoOpsId: p.contratoOpsId,
      contratoId: p.contratoOpsId ? null : p.contratoId,
      rol: 'EMPLEADO',
      userId: opts.usuarioId,
      userEmail: ctx.userEmail,
      ip: ctx.ip,
      userAgent: (await headers()).get('user-agent') ?? null,
      metodoAuth: opts.metodoAuth,
      documentos: [{ tipo: 'DOCUMENTO_CONTRATO', documentoId: doc.id, sha256: doc.sha256 }],
      firmadoEn: ahora,
    },
  })
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'contrato_firmado',
    titulo: `${nombreCorto(col.nombres, col.apellidos)} firmó «${p.nombre}»`,
    mensaje: 'El documento firmado ya está en el contrato.',
    colaboradorId: p.colaboradorId,
    enlace: p.terminacionId ? `/terminaciones/${p.terminacionId}` : p.contratoOpsId ? `/contratos/ops/${p.contratoOpsId}` : `/contratos/${p.contratoId}`,
  }).catch(() => {})
  return { documentoId: doc.id }
}

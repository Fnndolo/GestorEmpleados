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
import type { Prisma } from '@/generated/prisma/client'

/**
 * Preaviso de un contrato laboral (Contratos → Acciones → Enviar preaviso).
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
  contratoId: string
  nombre: string
  mensaje: string | null
  pdf: Buffer
  usuarioId: string
}) {
  const c = await prisma.contrato.findUnique({ where: { id: opts.contratoId }, select: { colaboradorId: true, numero: true } })
  if (!c) throw new ErrorNegocio('El contrato ya no existe.')
  const colaboradorId = c.colaboradorId

  const id = crypto.randomUUID()
  const doc = await guardarPdf(id, colaboradorId, `${opts.nombre} · Contrato ${c.numero}`, opts.pdf, opts.usuarioId)
  await dbAuditado.preavisoContrato.create({
    data: {
      id,
      colaboradorId,
      contratoId: opts.contratoId,
      nombre: opts.nombre,
      mensaje: opts.mensaje,
      documentoId: doc.id,
      enviadoPorId: opts.usuarioId,
    },
  })

  const uid = await usuarioDeColaborador(colaboradorId)
  if (uid) {
    await avisar(uid, {
      evento: 'contrato_por_firmar',
      titulo: `Tienes un documento por devolver: ${opts.nombre}`,
      mensaje: opts.mensaje || 'Descárgalo en Mis contratos, fírmalo o llénalo y vuelve a subir el PDF.',
      enlace: '/autoservicio/contratos',
      llamadoAccion: 'Ver el documento',
      colaboradorId,
    }).catch(() => {})
  }
  return { colaboradorId: colaboradorId }
}

/** La persona sube el PDF firmado. Puede reemplazarlo mientras quiera: queda el último. */
export async function responderPreaviso(opts: { preavisoId: string; colaboradorId: string; pdf: Buffer; usuarioId: string }) {
  const p = await prisma.preavisoContrato.findUnique({ where: { id: opts.preavisoId } })
  if (!p || p.colaboradorId !== opts.colaboradorId) throw new ErrorNegocio('Este documento no es tuyo.')

  const doc = await guardarPdf(p.id, p.colaboradorId, `${p.nombre} (firmado)`, opts.pdf, opts.usuarioId)
  await dbAuditado.preavisoContrato.update({ where: { id: p.id }, data: { respuestaDocId: doc.id, respondidoEn: new Date() } })
  if (p.respuestaDocId) await eliminarDocumento(p.respuestaDocId).catch(() => {})

  const col = await prisma.colaborador.findUnique({ where: { id: p.colaboradorId }, select: { nombres: true, apellidos: true } })
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'contrato_firmado',
    titulo: `${col ? nombreCorto(col.nombres, col.apellidos) : 'Un colaborador'} devolvió firmado: ${p.nombre}`,
    mensaje: 'El PDF ya está en el contrato.',
    colaboradorId: p.colaboradorId,
    enlace: `/contratos/${p.contratoId}`,
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

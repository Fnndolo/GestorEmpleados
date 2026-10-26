import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import { renderCartaTerminacion } from '@/server/pdf/carta-terminacion'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { hoyBogota } from '@/lib/fechas'
import { datosBaseDocumento, guardarDocumentoColaborador, leerArchivoSubido, nombreUsuario, MOTIVO_TERMINACION } from '@/server/terminacion-documentos'

/**
 * Pasos de la terminación que no se firman: la orden y el resultado del examen
 * médico de egreso, y el soporte de los aportes a seguridad social. Lo que el
 * trabajador debe tener (la orden, el soporte) le queda en su autoservicio.
 */

async function terminacionAbierta(terminacionId: string) {
  const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: terminacionId } })
  if (t.estado === 'CERRADA') throw new ErrorNegocio('La terminación ya está cerrada.')
  return t
}

/** Genera (o rehace) la orden del examen de egreso y se la deja al trabajador. */
export async function generarOrdenExamenEgreso(terminacionId: string, usuarioId: string): Promise<void> {
  const t = await terminacionAbierta(terminacionId)
  const pdf = await renderCartaTerminacion('ORDEN_EXAMEN_EGRESO', {
    ...(await datosBaseDocumento(t.colaboradorId)),
    fecha: hoyBogota(),
    fechaRetiro: t.fechaRetiro,
    motivo: MOTIVO_TERMINACION[t.tipo] ?? t.tipo,
    observaciones: null,
    preavisoDias: null,
    firmante: await nombreUsuario(usuarioId),
  })
  const { documentoId } = await guardarDocumentoColaborador({
    colaboradorId: t.colaboradorId, carpeta: 'examen-egreso', archivo: `orden-examen-egreso-${t.id}.pdf`,
    nombre: 'Orden de examen médico de egreso', contenido: pdf, mime: 'application/pdf', usuarioId,
  })
  await dbAuditado.terminacion.update({ where: { id: t.id }, data: { ordenExamenDocId: documentoId } })
  if (t.ordenExamenDocId) await eliminarDocumento(t.ordenExamenDocId).catch(() => {})

  const uid = await usuarioDeColaborador(t.colaboradorId)
  if (uid) {
    await avisar(uid, {
      evento: 'orden_examen_egreso',
      titulo: 'Tu orden de examen médico de egreso',
      mensaje: 'Descárgala y preséntala en la IPS dentro de los 5 días hábiles siguientes a tu retiro.',
      enlace: '/autoservicio/retiro',
      llamadoAccion: 'Ver la orden',
    }).catch(() => {})
  }
}

/**
 * Registra el examen de egreso: si se hizo, queda como examen de EGRESO en SST
 * (el certificado es un soporte: se adjunta en el momento o después con
 * `adjuntarCertificadoExamenEgreso`, con nivel médico por ser dato de salud,
 * Ley 1581); si no asistió en el plazo, queda la constancia. Volver a
 * registrarlo corrige el examen que ya estaba vinculado en vez de crear otro.
 */
export async function registrarExamenEgreso(opts: {
  terminacionId: string
  realizado: boolean
  fecha: Date
  concepto?: 'APTO' | 'APTO_CON_RECOMENDACIONES' | 'NO_APTO' | 'APLAZADO'
  certificadoDataUri?: string | null
  usuarioId: string
}): Promise<void> {
  const t = await terminacionAbierta(opts.terminacionId)

  if (!opts.realizado) {
    await dbAuditado.terminacion.update({ where: { id: t.id }, data: { examenNoAsistio: true, examenMedicoId: null, examenRegistradoEn: new Date() } })
    return
  }

  const datos = { colaboradorId: t.colaboradorId, tipo: 'EGRESO' as const, fecha: opts.fecha, concepto: opts.concepto ?? 'APTO' }
  const existente = t.examenMedicoId ? await prisma.examenMedico.findUnique({ where: { id: t.examenMedicoId }, select: { id: true, documentoId: true } }) : null
  const examen = existente
    ? await dbAuditado.examenMedico.update({ where: { id: existente.id }, data: datos, select: { id: true, documentoId: true } })
    : await dbAuditado.examenMedico.create({ data: datos, select: { id: true, documentoId: true } })
  if (opts.certificadoDataUri) await guardarCertificadoEgreso(t.colaboradorId, examen, opts.certificadoDataUri, opts.usuarioId)
  await dbAuditado.terminacion.update({ where: { id: t.id }, data: { examenMedicoId: examen.id, examenNoAsistio: false, examenRegistradoEn: new Date() } })
}

/** Guarda el certificado del examen (nivel médico) y lo deja apuntado desde el examen; el anterior se retira. */
async function guardarCertificadoEgreso(colaboradorId: string, examen: { id: string; documentoId: string | null }, dataUri: string, usuarioId: string): Promise<void> {
  const archivo = leerArchivoSubido(dataUri)
  const { documentoId } = await guardarDocumentoColaborador({
    colaboradorId, carpeta: 'examen-egreso', archivo: `certificado-egreso-${examen.id}.${archivo.ext}`,
    nombre: 'Certificado de examen médico de egreso', contenido: archivo.contenido, mime: archivo.mime, usuarioId,
    nivelAcceso: 'SST_MEDICO', entidad: { tipo: 'ExamenMedico', id: examen.id },
  })
  await dbAuditado.examenMedico.update({ where: { id: examen.id }, data: { documentoId } })
  if (examen.documentoId && examen.documentoId !== documentoId) await eliminarDocumento(examen.documentoId).catch(() => {})
}

/**
 * Adjunta (o reemplaza) el certificado de un examen de egreso ya registrado como
 * realizado: para cuando se registró sin tener el archivo, o se subió el equivocado.
 */
export async function adjuntarCertificadoExamenEgreso(opts: { terminacionId: string; certificadoDataUri: string; usuarioId: string }): Promise<void> {
  const t = await terminacionAbierta(opts.terminacionId)
  if (!t.examenMedicoId) throw new ErrorNegocio('Primero registra el examen como realizado; el certificado se adjunta sobre ese registro.')
  const examen = await prisma.examenMedico.findUnique({ where: { id: t.examenMedicoId }, select: { id: true, documentoId: true } })
  if (!examen) throw new ErrorNegocio('El examen vinculado ya no existe: vuelve a registrarlo.')
  await guardarCertificadoEgreso(t.colaboradorId, examen, opts.certificadoDataUri, opts.usuarioId)
}

/** Soporte del pago de aportes de los últimos 3 meses (art. 65 CST, parágrafo 1): queda en su autoservicio. */
export async function cargarSoporteSeguridadSocial(terminacionId: string, dataUri: string, usuarioId: string): Promise<void> {
  const t = await terminacionAbierta(terminacionId)
  const archivo = leerArchivoSubido(dataUri)
  const { documentoId } = await guardarDocumentoColaborador({
    colaboradorId: t.colaboradorId, carpeta: 'seguridad-social', archivo: `aportes-retiro-${t.id}.${archivo.ext}`,
    nombre: 'Soporte de aportes a seguridad social (últimos 3 meses)', contenido: archivo.contenido, mime: archivo.mime, usuarioId,
  })
  await dbAuditado.terminacion.update({ where: { id: t.id }, data: { seguridadSocialDocId: documentoId } })
  if (t.seguridadSocialDocId) await eliminarDocumento(t.seguridadSocialDocId).catch(() => {})

  const uid = await usuarioDeColaborador(t.colaboradorId)
  if (uid) {
    await avisar(uid, {
      evento: 'seguridad_social_retiro',
      titulo: 'Soporte de tus aportes a seguridad social',
      mensaje: 'Ya puedes descargar el soporte del pago de tus aportes de los últimos tres meses.',
      enlace: '/autoservicio/retiro',
    }).catch(() => {})
  }
}

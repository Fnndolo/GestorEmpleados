import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { contextoActual } from '@/server/contexto'
import { subirArchivo } from '@/server/storage'
import { leerFirmaComoDataUri } from '@/server/contratos-ops-pdf'
import { renderCartaTerminacion } from '@/server/pdf/carta-terminacion'
import type { FirmaAplicada } from '@/server/pdf/firmas-terminacion'
import { avisar, avisarPorRol } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'
import { formatFechaLarga, hoyBogota } from '@/lib/fechas'
import { datosBaseDocumento, guardarDocumentoColaborador } from '@/server/terminacion-documentos'

/** La carta de renuncia en PDF: sin firma para verla antes, con firma al presentarla. */
export async function renderCartaRenuncia(colaboradorId: string, fechaRetiro: Date, motivo: string | null, firma: FirmaAplicada | null = null): Promise<Buffer> {
  return renderCartaTerminacion('CARTA_RENUNCIA', {
    ...(await datosBaseDocumento(colaboradorId)),
    fecha: hoyBogota(),
    fechaRetiro,
    motivo: 'renuncia voluntaria',
    observaciones: motivo,
    preavisoDias: null,
    firmaTrabajador: firma,
  })
}

/**
 * Renuncia presentada por el trabajador desde su autoservicio: escribe su
 * último día y el motivo (opcional) y firma la carta (código al correo + firma
 * dibujada, Ley 527). A Talento Humano le llega a Terminaciones, donde la
 * acepta registrando la terminación; mientras no la acepte, él la puede retirar.
 */
export async function presentarRenuncia(opts: {
  colaboradorId: string
  usuarioId: string
  fechaRetiro: Date
  motivo: string | null
  firmaDataUri: string
  metodoAuth: string
}): Promise<{ renunciaId: string }> {
  const [pendiente, abierta, colab] = await Promise.all([
    prisma.renuncia.findFirst({ where: { colaboradorId: opts.colaboradorId, estado: 'PRESENTADA' } }),
    prisma.terminacion.findFirst({ where: { colaboradorId: opts.colaboradorId, estado: { not: 'CERRADA' } } }),
    prisma.colaborador.findUniqueOrThrow({ where: { id: opts.colaboradorId }, select: { estado: true, nombres: true, apellidos: true } }),
  ])
  if (colab.estado !== 'ACTIVO') throw new ErrorNegocio('Tu vínculo no está activo.')
  if (pendiente) throw new ErrorNegocio('Ya presentaste una renuncia que está esperando respuesta de Talento Humano.')
  if (abierta) throw new ErrorNegocio('Ya hay un proceso de retiro en curso.')
  if (opts.fechaRetiro < hoyBogota()) throw new ErrorNegocio('El último día no puede ser una fecha pasada.')

  const png = Buffer.from(opts.firmaDataUri.split(',')[1] ?? '', 'base64')
  if (png.byteLength === 0) throw new ErrorNegocio('La firma está vacía.')
  const ahora = new Date()
  const archivoFirma = await subirArchivo(`colaboradores/${opts.colaboradorId}/renuncia/firmas`, `firma-renuncia-${ahora.getTime()}.png`, png, 'image/png')

  const pdf = await renderCartaRenuncia(opts.colaboradorId, opts.fechaRetiro, opts.motivo, {
    dataUri: await leerFirmaComoDataUri(archivoFirma.storagePath), fecha: ahora,
  })
  const { documentoId, sha256 } = await guardarDocumentoColaborador({
    colaboradorId: opts.colaboradorId, carpeta: 'renuncia', archivo: `carta-renuncia-${ahora.getTime()}.pdf`,
    nombre: 'Carta de renuncia (firmada)', contenido: pdf, mime: 'application/pdf', usuarioId: opts.usuarioId,
  })
  const renuncia = await dbAuditado.renuncia.create({
    data: {
      colaboradorId: opts.colaboradorId, fechaRetiro: opts.fechaRetiro, motivo: opts.motivo,
      documentoId, firmaPath: archivoFirma.storagePath, firmadoEn: ahora,
    },
  })

  const ctx = contextoActual()
  await prisma.evidenciaFirmaContrato.create({
    data: {
      renunciaId: renuncia.id, rol: 'EMPLEADO', userId: opts.usuarioId, userEmail: ctx.userEmail, ip: ctx.ip,
      userAgent: (await headers()).get('user-agent') ?? null, metodoAuth: opts.metodoAuth,
      documentos: [{ tipo: 'CARTA_RENUNCIA', documentoId, sha256 }], firmadoEn: ahora,
    },
  })

  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'renuncia_presentada',
    titulo: `${nombreCorto(colab.nombres, colab.apellidos)} presentó su renuncia`,
    mensaje: `Último día: ${formatFechaLarga(opts.fechaRetiro)}.${opts.motivo ? ` Motivo: ${opts.motivo}` : ''}`,
    colaboradorId: opts.colaboradorId,
    enlace: `/terminaciones?renuncia=${renuncia.id}`,
    llamadoAccion: 'Aceptar la renuncia',
  }).catch(() => {})

  return { renunciaId: renuncia.id }
}

/** El trabajador retira su renuncia mientras Talento Humano no la haya aceptado. */
export async function retirarRenuncia(renunciaId: string, colaboradorId: string): Promise<void> {
  const r = await prisma.renuncia.findUnique({ where: { id: renunciaId }, include: { colaborador: { select: { nombres: true, apellidos: true } } } })
  if (!r || r.colaboradorId !== colaboradorId) throw new ErrorNegocio('Esta renuncia no está a tu nombre.')
  if (r.estado !== 'PRESENTADA') throw new ErrorNegocio('Esta renuncia ya no se puede retirar.')
  await dbAuditado.renuncia.update({ where: { id: r.id }, data: { estado: 'RETIRADA' } })
  await avisarPorRol(['Administrador', 'Recursos Humanos'], {
    evento: 'renuncia_presentada',
    titulo: `${nombreCorto(r.colaborador.nombres, r.colaborador.apellidos)} retiró su renuncia`,
    mensaje: 'Ya no es necesario registrar su terminación.',
    colaboradorId,
    enlace: '/terminaciones',
  }).catch(() => {})
}

/**
 * Talento Humano devuelve la renuncia para que el trabajador la corrija: la
 * fecha no cumple el preaviso, falta información… La renuncia en sí no se niega
 * (es decisión del trabajador); se le pide presentarla de nuevo, y se le dice por qué.
 */
export async function devolverRenuncia(renunciaId: string, motivo: string): Promise<void> {
  const r = await prisma.renuncia.findUnique({
    where: { id: renunciaId },
    include: { colaborador: { select: { usuarioId: true } } },
  })
  if (!r || r.estado !== 'PRESENTADA') throw new ErrorNegocio('La renuncia ya no está pendiente.')
  await dbAuditado.renuncia.update({ where: { id: r.id }, data: { estado: 'DEVUELTA', motivoDevolucion: motivo, devueltaEn: new Date() } })
  if (r.colaborador.usuarioId) {
    await avisar(r.colaborador.usuarioId, {
      evento: 'renuncia_devuelta',
      titulo: 'Talento Humano devolvió tu renuncia para corregirla',
      mensaje: motivo,
      colaboradorId: r.colaboradorId,
      enlace: '/autoservicio/retiro',
      llamadoAccion: 'Corregir y presentar de nuevo',
    }).catch(() => {})
  }
}

/**
 * Al registrar la terminación desde una renuncia presentada: la renuncia queda
 * ACEPTADA y su carta firmada pasa a ser la carta de renuncia de la terminación.
 */
export async function vincularRenuncia(renunciaId: string, terminacionId: string, colaboradorId: string): Promise<void> {
  const r = await prisma.renuncia.findUnique({ where: { id: renunciaId } })
  if (!r || r.colaboradorId !== colaboradorId || r.estado !== 'PRESENTADA') throw new ErrorNegocio('La renuncia ya no está pendiente.')
  await dbAuditado.renuncia.update({ where: { id: r.id }, data: { estado: 'ACEPTADA', terminacionId } })
  await dbAuditado.cartaTerminacion.create({
    data: {
      terminacionId, tipo: 'CARTA_RENUNCIA', documentoId: r.documentoId,
      enviadoFirmaEn: r.firmadoEn, firmaPath: r.firmaPath, firmadoEn: r.firmadoEn,
    },
  })
}

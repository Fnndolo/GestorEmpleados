import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { eliminarDocumento } from '@/server/documentos'

/** Entidad de los comprobantes del pago de la nómina de una persona. */
export const ENTIDAD_PAGO_NOMINA = 'PagoNomina'

/** Valida un comprobante subido como data URI (PDF o imagen, máx. 8 MB). */
function leerComprobante(dataUri: string): { mime: string; ext: string; contenido: Buffer } {
  const m = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new ErrorNegocio('El comprobante no es un archivo válido.')
  const [, mime, b64] = m
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ErrorNegocio('El comprobante debe ser un PDF o una imagen.')
  const contenido = Buffer.from(b64, 'base64')
  if (contenido.byteLength > 8 * 1024 * 1024) throw new ErrorNegocio('El comprobante pesa más de 8 MB.')
  return { mime, ext: mime === 'application/pdf' ? 'pdf' : mime.split('/')[1], contenido }
}

/**
 * Registra el pago de la nómina de UNA persona en un periodo cerrado: cada
 * colaborador se paga aparte. El comprobante de la transferencia es un soporte:
 * se puede adjuntar en el momento o después, desde la misma fila. Cuando ya
 * están pagados todos, el periodo pasa a PAGADA (inmutable). Volver a
 * registrarlo actualiza la fecha y, si viene archivo, reemplaza el comprobante
 * (archivo equivocado); sin archivo, el que había se conserva.
 *
 * Solo en periodos cerrados: antes de cerrar las cifras pueden recalcularse, y
 * recalcular borra las liquidaciones con lo que tuvieran registrado.
 */
export async function registrarPagoNomina(opts: {
  liquidacionId: string
  fechaPago: Date
  comprobanteDataUri?: string | null
  usuarioId: string
}): Promise<{ periodoPagado: boolean; periodoNombre: string; colaboradorId: string; neto: number; conComprobante: boolean }> {
  const liq = await prisma.liquidacionNomina.findUniqueOrThrow({
    where: { id: opts.liquidacionId },
    include: { periodo: true, colaborador: { select: { sedeId: true } } },
  })
  if (liq.periodo.estado !== 'CERRADA' && liq.periodo.estado !== 'PAGADA') {
    throw new ErrorNegocio('El pago se registra cuando el periodo está cerrado: antes sus cifras todavía pueden cambiar.')
  }

  let comprobantePagoId = liq.comprobantePagoId
  if (opts.comprobanteDataUri) {
    const { mime, ext, contenido } = leerComprobante(opts.comprobanteDataUri)
    const archivo = await subirArchivo(`nomina/pagos/${liq.colaboradorId}`, `comprobante-${liq.periodo.nombre}.${ext}`, contenido, mime)
    // Mismo nivel de acceso que el desprendible: es de la persona y de nómina.
    const doc = await dbAuditado.documento.create({
      data: {
        entidadTipo: ENTIDAD_PAGO_NOMINA, entidadId: liq.id, nombre: `Comprobante de pago · ${liq.periodo.nombre}`,
        bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: mime, tamanoBytes: archivo.tamanoBytes,
        nivelAcceso: 'RRHH', sedeId: liq.colaborador.sedeId, subidoPorId: opts.usuarioId,
      },
    })
    comprobantePagoId = doc.id
  }
  await dbAuditado.liquidacionNomina.update({ where: { id: liq.id }, data: { pagadoEn: opts.fechaPago, comprobantePagoId } })
  // Se reapunta ANTES de borrar el anterior, para no dejar la liquidación apuntando a nada.
  if (liq.comprobantePagoId && liq.comprobantePagoId !== comprobantePagoId) await eliminarDocumento(liq.comprobantePagoId).catch(() => {})

  // ¿Ya están todos? Entonces el periodo queda pagado.
  const pendientes = await prisma.liquidacionNomina.count({ where: { periodoId: liq.periodoId, pagadoEn: null } })
  let periodoPagado = liq.periodo.estado === 'PAGADA'
  if (pendientes === 0 && liq.periodo.estado === 'CERRADA') {
    await dbAuditado.periodoNomina.update({ where: { id: liq.periodoId }, data: { estado: 'PAGADA' } })
    periodoPagado = true
  }
  return { periodoPagado, periodoNombre: liq.periodo.nombre, colaboradorId: liq.colaboradorId, neto: Number(liq.neto), conComprobante: !!comprobantePagoId }
}

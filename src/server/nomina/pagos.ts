import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { eliminarDocumento } from '@/server/documentos'

/** Entidad de los comprobantes del pago de la nómina de una persona. */
export const ENTIDAD_PAGO_NOMINA = 'PagoNomina'

/**
 * Registra el pago de la nómina de UNA persona en un periodo cerrado, con el
 * comprobante de su transferencia: cada colaborador se paga aparte. Cuando ya
 * están pagados todos, el periodo pasa a PAGADA (inmutable). Volver a
 * registrarlo reemplaza el comprobante y la fecha (archivo equivocado).
 *
 * Solo en periodos cerrados: antes de cerrar las cifras pueden recalcularse, y
 * recalcular borra las liquidaciones con lo que tuvieran registrado.
 */
export async function registrarPagoNomina(opts: {
  liquidacionId: string
  fechaPago: Date
  comprobanteDataUri: string
  usuarioId: string
}): Promise<{ periodoPagado: boolean; periodoNombre: string; colaboradorId: string; neto: number }> {
  const liq = await prisma.liquidacionNomina.findUniqueOrThrow({
    where: { id: opts.liquidacionId },
    include: { periodo: true, colaborador: { select: { sedeId: true } } },
  })
  if (liq.periodo.estado !== 'CERRADA' && liq.periodo.estado !== 'PAGADA') {
    throw new ErrorNegocio('El pago se registra cuando el periodo está cerrado: antes sus cifras todavía pueden cambiar.')
  }

  const m = opts.comprobanteDataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new ErrorNegocio('El comprobante no es un archivo válido.')
  const [, mime, b64] = m
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ErrorNegocio('El comprobante debe ser un PDF o una imagen.')
  const contenido = Buffer.from(b64, 'base64')
  if (contenido.byteLength > 8 * 1024 * 1024) throw new ErrorNegocio('El comprobante pesa más de 8 MB.')
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]

  const archivo = await subirArchivo(`nomina/pagos/${liq.colaboradorId}`, `comprobante-${liq.periodo.nombre}.${ext}`, contenido, mime)
  // Mismo nivel de acceso que el desprendible: es de la persona y de nómina.
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: ENTIDAD_PAGO_NOMINA, entidadId: liq.id, nombre: `Comprobante de pago · ${liq.periodo.nombre}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: mime, tamanoBytes: archivo.tamanoBytes,
      nivelAcceso: 'RRHH', sedeId: liq.colaborador.sedeId, subidoPorId: opts.usuarioId,
    },
  })
  await dbAuditado.liquidacionNomina.update({ where: { id: liq.id }, data: { pagadoEn: opts.fechaPago, comprobantePagoId: doc.id } })
  if (liq.comprobantePagoId) await eliminarDocumento(liq.comprobantePagoId).catch(() => {})

  // ¿Ya están todos? Entonces el periodo queda pagado.
  const pendientes = await prisma.liquidacionNomina.count({ where: { periodoId: liq.periodoId, pagadoEn: null } })
  let periodoPagado = liq.periodo.estado === 'PAGADA'
  if (pendientes === 0 && liq.periodo.estado === 'CERRADA') {
    await dbAuditado.periodoNomina.update({ where: { id: liq.periodoId }, data: { estado: 'PAGADA' } })
    periodoPagado = true
  }
  return { periodoPagado, periodoNombre: liq.periodo.nombre, colaboradorId: liq.colaboradorId, neto: Number(liq.neto) }
}

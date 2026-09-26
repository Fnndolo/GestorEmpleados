import 'server-only'
import { prisma } from '@/lib/db'
import { ErrorNegocio } from '@/server/accion'
import { createHash } from 'node:crypto'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { fechaBreve } from '@/lib/notificaciones/texto'

/**
 * Reglas de las incapacidades que comparten el registro de Talento Humano
 * (Novedades) y el reporte del colaborador (autoservicio).
 *
 * El soporte es dato de salud (Ley 1581): se guarda con nivel SST_MEDICO, así
 * solo lo abre quien tiene el permiso de datos de salud, además del propio
 * colaborador.
 */

/** Fechas coherentes y sin cruce con otra incapacidad ya registrada de la misma persona. */
export async function validarFechasIncapacidad(opts: { colaboradorId: string; inicio: Date; fin: Date; excluirId?: string }): Promise<void> {
  if (opts.fin < opts.inicio) throw new ErrorNegocio('La fecha de fin no puede ser anterior al inicio.')
  const cruce = await prisma.incapacidad.findFirst({
    where: {
      colaboradorId: opts.colaboradorId,
      fechaInicio: { lte: opts.fin },
      fechaFin: { gte: opts.inicio },
      ...(opts.excluirId ? { id: { not: opts.excluirId } } : {}),
    },
    select: { fechaInicio: true, fechaFin: true },
  })
  if (cruce) {
    throw new ErrorNegocio(
      `Se cruza con otra incapacidad ya registrada (${fechaBreve(cruce.fechaInicio)} a ${fechaBreve(cruce.fechaFin)}). Si es una prórroga, debe empezar el día siguiente.`,
    )
  }
}

/**
 * ¿Ya se pagó en una nómina cerrada? Entonces no se cambia ni se borra: la
 * nómina de ese periodo ya la liquidó y corregirla es un ajuste contable.
 */
export async function exigirNoLiquidadaEnNominaCerrada(inc: { colaboradorId: string; fechaInicio: Date; fechaFin: Date }): Promise<void> {
  const liquidada = await prisma.liquidacionNomina.findFirst({
    where: {
      colaboradorId: inc.colaboradorId,
      periodo: { estado: { in: ['CERRADA', 'PAGADA'] }, fechaInicio: { lte: inc.fechaFin }, fechaFin: { gte: inc.fechaInicio } },
    },
    select: { periodo: { select: { nombre: true } } },
  })
  if (liquidada) {
    throw new ErrorNegocio(`Esta incapacidad ya se pagó en la nómina cerrada "${liquidada.periodo.nombre}": no se puede cambiar ni borrar.`)
  }
}

/** Guarda el soporte que adjunta Talento Humano (PDF o imagen; nivel de datos de salud). */
export async function guardarSoporteIncapacidad(opts: { incapacidadId: string; colaboradorId: string; dataUri: string; nombreArchivo: string; usuarioId: string }): Promise<string> {
  const m = opts.dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new ErrorNegocio('El soporte no es un archivo válido.')
  const [, mime, b64] = m
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ErrorNegocio('El soporte debe ser un PDF o una imagen.')
  const contenido = Buffer.from(b64, 'base64')
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
  const subido = await subirArchivo(`colaboradores/${opts.colaboradorId}/incapacidades`, `soporte-${opts.incapacidadId}-${Date.now()}.${ext}`, contenido, mime)
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'Incapacidad', entidadId: opts.incapacidadId, nombre: `Soporte de incapacidad — ${opts.nombreArchivo}`,
      bucket: subido.bucket, storagePath: subido.storagePath, mimeType: mime, tamanoBytes: subido.tamanoBytes,
      sha256: createHash('sha256').update(contenido).digest('hex'), nivelAcceso: 'SST_MEDICO', subidoPorId: opts.usuarioId,
    },
  })
  return doc.id
}

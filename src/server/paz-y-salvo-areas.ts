import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { avisar, avisarPorRol } from '@/server/notificaciones/avisar'
import { nombreCorto } from '@/lib/notificaciones/texto'

/**
 * Áreas del paz y salvo: las define la empresa en Ajustes → Paz y salvo, con un
 * responsable cada una. Al registrar una terminación se copian como ítems; el
 * responsable de cada área recibe el aviso y verifica su parte (Talento Humano
 * puede verificar cualquiera). Cuando la última área verifica, se avisa a
 * Talento Humano para firmar y enviar el acta.
 */

/** Las de fábrica, por si en Ajustes no hay ninguna activa. */
const AREAS_DE_FABRICA = [
  { nombre: 'Activos', concepto: 'Equipos y activos asignados devueltos', chequeo: 'ACTIVOS', responsableId: null },
  { nombre: 'Cartera', concepto: 'Préstamos y cartera al día', chequeo: 'PRESTAMOS', responsableId: null },
  { nombre: 'Documentos', concepto: 'Documentos y expedientes entregados', chequeo: null, responsableId: null },
  { nombre: 'Sistemas', concepto: 'Accesos y correos revocados', chequeo: null, responsableId: null },
  { nombre: 'Dotación', concepto: 'Dotación devuelta (si aplica)', chequeo: null, responsableId: null },
]

/** Crea los ítems del paz y salvo de una terminación nueva y avisa a cada responsable. */
export async function crearItemsPazYSalvo(opts: { pazYSalvoId: string; terminacionId: string; colaboradorId: string }): Promise<void> {
  const configuradas = await prisma.areaPazYSalvo.findMany({ where: { activa: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
  const areas = configuradas.length ? configuradas : AREAS_DE_FABRICA

  // Alertas automáticas para quien verifica: préstamo con saldo y activos sin devolver.
  const [saldoPrestamo, activosSinDevolver, colab] = await Promise.all([
    prisma.prestamo.aggregate({ where: { colaboradorId: opts.colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } }),
    prisma.asignacionActivo.count({ where: { colaboradorId: opts.colaboradorId, fechaDevolucion: null } }),
    prisma.colaborador.findUniqueOrThrow({ where: { id: opts.colaboradorId }, select: { nombres: true, apellidos: true } }),
  ])
  const alerta = (chequeo: string | null) =>
    chequeo === 'PRESTAMOS' && Number(saldoPrestamo._sum.saldo ?? 0) > 0
      ? 'Tiene saldo de préstamo pendiente.'
      : chequeo === 'ACTIVOS' && activosSinDevolver > 0
        ? `Tiene ${activosSinDevolver} activo${activosSinDevolver === 1 ? '' : 's'} sin devolver.`
        : null

  // Uno por uno (no createMany) para que el orden por id siga el orden de las áreas.
  for (const a of areas) {
    await prisma.pazYSalvoItem.create({
      data: { pazYSalvoId: opts.pazYSalvoId, area: a.nombre, concepto: a.concepto, responsableId: a.responsableId, observacion: alerta(a.chequeo), cumplido: false },
    })
  }

  const nombre = nombreCorto(colab.nombres, colab.apellidos)
  const porResponsable = new Map<string, string[]>()
  for (const a of areas) if (a.responsableId) porResponsable.set(a.responsableId, [...(porResponsable.get(a.responsableId) ?? []), a.nombre])
  for (const [uid, nombres] of porResponsable) {
    await avisar(uid, {
      evento: 'paz_y_salvo_area_pendiente',
      titulo: `Verifica la entrega de ${nombre}`,
      mensaje: `Se retira y está pendiente su paz y salvo en: ${nombres.join(', ')}.`,
      colaboradorId: opts.colaboradorId,
      enlace: '/autoservicio/verificar-entregas',
      llamadoAccion: 'Verificar',
    }).catch(() => {})
  }
}

/**
 * Marca (o desmarca) un área. `soloSuya`: quien no es de Talento Humano solo
 * puede marcar las áreas de las que es responsable. Con el acta ya enviada a
 * firmar, el checklist queda congelado: es lo que el trabajador firma.
 */
export async function marcarAreaPazYSalvo(opts: { itemId: string; cumplido: boolean; usuarioId: string; soloSuya: boolean }): Promise<void> {
  const item = await prisma.pazYSalvoItem.findUniqueOrThrow({
    where: { id: opts.itemId },
    include: { pazYSalvo: { select: { id: true, enviadoFirmaEn: true, terminacion: { select: { id: true, estado: true, colaboradorId: true } } } } },
  })
  if (opts.soloSuya && item.responsableId !== opts.usuarioId) throw new ErrorNegocio('Esta área no está a tu cargo.')
  if (item.pazYSalvo.terminacion.estado === 'CERRADA') throw new ErrorNegocio('La terminación ya está cerrada.')
  if (item.pazYSalvo.enviadoFirmaEn) {
    throw new ErrorNegocio('El acta ya se envió a firmar con estas áreas. Talento Humano debe retirar el envío para corregir el checklist.')
  }

  await dbAuditado.pazYSalvoItem.update({
    where: { id: opts.itemId },
    data: { cumplido: opts.cumplido, verificadoPorId: opts.cumplido ? opts.usuarioId : null, verificadoEn: opts.cumplido ? new Date() : null },
  })
  const pendientes = await prisma.pazYSalvoItem.count({ where: { pazYSalvoId: item.pazYSalvo.id, cumplido: false } })
  const antes = await prisma.pazYSalvo.findUniqueOrThrow({ where: { id: item.pazYSalvo.id }, select: { estado: true } })
  await prisma.pazYSalvo.update({ where: { id: item.pazYSalvo.id }, data: { estado: pendientes === 0 ? 'COMPLETO' : 'PENDIENTE' } })

  // La última área en verificar le avisa a Talento Humano que ya puede enviar el acta.
  if (pendientes === 0 && antes.estado !== 'COMPLETO') {
    const c = await prisma.colaborador.findUnique({ where: { id: item.pazYSalvo.terminacion.colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Administrador', 'Recursos Humanos'], {
      evento: 'paz_y_salvo_completo',
      titulo: `Todas las áreas verificaron la entrega de ${nombreCorto(c?.nombres, c?.apellidos)}`,
      mensaje: 'Ya puedes firmar y enviar el acta de paz y salvo.',
      colaboradorId: item.pazYSalvo.terminacion.colaboradorId,
      enlace: `/terminaciones/${item.pazYSalvo.terminacion.id}?paso=paz-y-salvo`,
      llamadoAccion: 'Enviar el acta',
    }).catch(() => {})
  }
}

import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { resolverVencimiento } from '@/server/vencimientos/servicio'
import { restringirAccesoSiSinVinculo } from '@/server/rol-consulta'
import { hoyBogota } from '@/lib/fechas'

/**
 * El retiro efectivo de quien termina su contrato: colaborador RETIRADO,
 * contrato TERMINADO, OPS vigentes cerrados y acceso de solo consulta.
 *
 * No se hace al registrar la terminación sino al terminar su último día (la
 * fecha de retiro): hasta entonces sigue trabajando y conserva sus trámites. Si
 * la terminación se registra con el último día ya pasado, se aplica de una vez;
 * si no, lo aplica el cron de cada noche.
 *
 * La fecha de retiro de la ficha sí se fija al registrar: es lo que saca a la
 * persona de la nómina del periodo en que se retira (esos días van en la
 * liquidación definitiva; incluirlos en ambas le pagaría el mes dos veces).
 */

/** ¿Ya terminó su último día? (la fecha de retiro es anterior a hoy en Bogotá). */
export function ultimoDiaPasado(fechaRetiro: Date): boolean {
  return fechaRetiro < hoyBogota()
}

/** Aplica el retiro de una terminación (idempotente). Devuelve si se restringió el acceso. */
export async function aplicarRetiro(terminacionId: string, usuarioId: string | null): Promise<{ accesoRestringido: boolean }> {
  const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: terminacionId } })
  if (t.retiroAplicadoEn) return { accesoRestringido: false }

  await dbAuditado.colaborador.update({ where: { id: t.colaboradorId }, data: { estado: 'RETIRADO', fechaRetiro: t.fechaRetiro } })
  const contrato = await prisma.contrato.findFirst({ where: { colaboradorId: t.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' } })
  if (contrato) await dbAuditado.contrato.update({ where: { id: contrato.id }, data: { estado: 'TERMINADO' } })

  // Los OPS vigentes también se cierran: quien se retira no sigue prestando servicios.
  const opsVigentes = await prisma.contratoOps.findMany({
    where: { colaboradorId: t.colaboradorId, estado: { in: ['ACTIVO', 'FIRMADO'] } },
    select: { id: true },
  })
  for (const o of opsVigentes) {
    await dbAuditado.contratoOps.update({
      where: { id: o.id },
      data: { estado: 'TERMINADO', cerradoEn: t.fechaRetiro, motivoCierre: 'RETIRO', cerradoPorId: usuarioId },
    })
    await resolverVencimiento('ContratoOps', o.id, 'CONTRATO_OPS')
  }

  await dbAuditado.terminacion.update({ where: { id: t.id }, data: { retiroAplicadoEn: new Date() } })
  // Acceso de solo consulta: sin vínculo vigente ya no crea solicitudes ni radica
  // nada; solo ve su historial (habeas data) y firma los documentos de su retiro.
  return { accesoRestringido: await restringirAccesoSiSinVinculo(t.colaboradorId) }
}

/** Cron de cada noche: aplica los retiros cuyo último día ya terminó. */
export async function aplicarRetirosVencidos(): Promise<{ aplicados: number }> {
  const pendientes = await prisma.terminacion.findMany({
    where: { retiroAplicadoEn: null, fechaRetiro: { lt: hoyBogota() } },
    select: { id: true },
  })
  for (const t of pendientes) await aplicarRetiro(t.id, null)
  return { aplicados: pendientes.length }
}

import 'server-only'
import { prisma } from '@/lib/db'
import { hoyBogota, formatFechaCorta } from '@/lib/fechas'
import { notificarUsuario } from '@/server/notificaciones/avisar'

/**
 * Contratos cuya fecha de fin ya pasó pero siguen ACTIVOS: o se prorrogaron y falta
 * registrarlo, o la persona ya no trabaja y falta la terminación. El sistema NO cierra
 * ni restringe nada por su cuenta —una terminación tiene efectos legales y de
 * liquidación, y un fijo suele prorrogarse con el papeleo unos días atrás—; solo
 * insiste a RR.HH. hasta que alguien registre la prórroga o la terminación.
 *
 * El aviso se repite UNA VEZ POR SEMANA por contrato (dedupeKey con el número de
 * semana), para que no se pierda entre notificaciones pero tampoco sature.
 * Se apaga solo: la prórroga actualiza `fechaFin` y la terminación pasa el contrato
 * a TERMINADO, con lo que deja de cumplir el filtro.
 */
export async function alertarContratosVencidosSinCierre(): Promise<{ vencidos: number }> {
  const hoy = hoyBogota()
  // Semana corrida desde epoch: misma clave durante 7 días → un aviso por semana.
  const semana = Math.floor(hoy.getTime() / (7 * 86_400_000))

  const [laborales, ops] = await Promise.all([
    prisma.contrato.findMany({
      where: { estado: 'ACTIVO', fechaFin: { lt: hoy } },
      select: { id: true, numero: true, fechaFin: true, colaborador: { select: { nombres: true, apellidos: true } } },
    }),
    prisma.contratoOps.findMany({
      where: { estado: { in: ['ACTIVO', 'FIRMADO'] }, fechaFin: { lt: hoy } },
      select: { id: true, numero: true, fechaFin: true, colaborador: { select: { nombres: true, apellidos: true } } },
    }),
  ])

  const pendientes = [
    ...laborales.map((c) => ({ ...c, tipo: 'laboral' as const, enlace: `/contratos/${c.id}` })),
    ...ops.map((c) => ({ ...c, tipo: 'OPS' as const, enlace: `/contratos/ops/${c.id}` })),
  ]
  if (pendientes.length === 0) return { vencidos: 0 }

  const destinatarios = await prisma.user.findMany({
    where: { estado: 'ACTIVO', rol: { nombre: { in: ['Recursos Humanos', 'Administrador'] } } },
    select: { id: true },
  })

  for (const c of pendientes) {
    const dias = Math.floor((hoy.getTime() - c.fechaFin!.getTime()) / 86_400_000)
    const persona = c.colaborador ? `${c.colaborador.nombres} ${c.colaborador.apellidos}` : 'contratista sin ficha'
    for (const u of destinatarios) {
      await notificarUsuario(
        u.id,
        'Contrato vencido sin cerrar',
        `El contrato ${c.tipo} ${c.numero} de ${persona} venció el ${formatFechaCorta(c.fechaFin!)} ` +
          `(hace ${dias} día${dias === 1 ? '' : 's'}) y sigue activo. Si continúa trabajando registra la prórroga; ` +
          `si ya no, registra la terminación (mientras tanto conserva su acceso completo).`,
        c.enlace,
        `contrato_vencido:${c.id}:${u.id}:${semana}`,
        'contrato_vencido_sin_cierre',
      )
    }
  }

  return { vencidos: pendientes.length }
}

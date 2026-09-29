import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'

export const ROL_CONSULTA = 'Consulta (retirado)'

/*
 * Rol de solo lectura que la plataforma asignaba SOLA a quien quedaba sin vínculo
 * vigente. Ya no se asigna automáticamente (el acceso se decide a mano desde
 * Usuarios, con el estado «Solo consulta»); se conserva el nombre para devolver
 * el acceso normal a quien todavía lo tenga.
 */

/**
 * Devuelve el acceso normal a quien había quedado en solo consulta.
 *
 * Hace falta cuando la terminación se anula o la persona se recontrata y aún
 * tiene el rol de retirado que antes se asignaba solo: sin esto el usuario queda
 * atrapado en el rol de retirado, sin poder pedir vacaciones ni firmar nada,
 * aunque su vínculo esté vigente otra vez.
 *
 * El rol al que vuelve es el que define su cargo; si el cargo no lo define,
 * «Empleado», que es el mismo criterio con que se crea el usuario.
 * Devuelve true si se restauró.
 */
export async function devolverAccesoNormal(colaboradorId: string): Promise<boolean> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: {
      usuarioId: true,
      cargo: { select: { rolDefectoId: true } },
      usuario: { select: { rol: { select: { nombre: true } } } },
    },
  })
  if (!colab?.usuarioId) return false
  // Solo se toca a quien está en solo consulta: si tiene otro rol, alguien se lo
  // asignó a propósito y no corresponde pisarlo.
  if (colab.usuario?.rol?.nombre !== ROL_CONSULTA) return false

  const rolId =
    colab.cargo?.rolDefectoId ??
    (await prisma.rol.findUnique({ where: { nombre: 'Empleado' }, select: { id: true } }))?.id
  if (!rolId) return false

  await dbAuditado.user.update({ where: { id: colab.usuarioId }, data: { rolId } })
  return true
}

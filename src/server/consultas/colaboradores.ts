import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { alcanceDe, type UsuarioSesion } from '@/server/sesion'
import { sedeActualId } from '@/server/sede-actual'

/**
 * Construye el `where` de Prisma para Colaborador según el alcance del usuario
 * y la sede activa seleccionada en el shell. Centraliza la regla de visibilidad.
 */
export async function whereColaboradores(
  usuario: UsuarioSesion,
  extra: Prisma.ColaboradorWhereInput = {},
): Promise<Prisma.ColaboradorWhereInput> {
  const alcance = alcanceDe(usuario, 'colaboradores', 'VER') ?? 'PROPIO'
  const sedeActiva = await sedeActualId()

  const cond: Prisma.ColaboradorWhereInput = { ...extra }

  if (alcance === 'PROPIO') {
    cond.id = usuario.colaboradorId ?? '∅'
    return cond
  }
  if (alcance === 'EQUIPO') {
    // Su equipo directo (jefe inmediato = su colaborador) o él mismo.
    // El equipo ES el alcance; NO se filtra además por la sede global del shell
    // (esa cookie puede venir de otra sesión y ocultaría a todo el equipo).
    cond.OR = [
      { jefeInmediatoId: usuario.colaboradorId ?? '∅' },
      { id: usuario.colaboradorId ?? '∅' },
    ]
    return cond
  }
  if (alcance === 'SEDES_ASIGNADAS') {
    cond.sedeId = { in: usuario.sedeIds.length ? usuario.sedeIds : ['∅'] }
  }
  // TODAS_SEDES: sin restricción por alcance

  // Filtro adicional por la sede seleccionada en el shell (solo roles que navegan por sede)
  if (sedeActiva) {
    cond.sedeId = sedeActiva
  }
  return cond
}

import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Accion, Alcance, ModuloClave } from '@/lib/permisos/modulos'
import {
  alcanceDe,
  tienePermiso,
  type PermisoEfectivo,
  type UsuarioSesion,
} from '@/lib/permisos/tipos'

export { alcanceDe, tienePermiso }
export type { PermisoEfectivo, UsuarioSesion }

/**
 * Devuelve el usuario autenticado con sus permisos efectivos y sedes asignadas.
 * `cache` evita repetir la consulta dentro de la misma petición (RSC).
 */
export const obtenerSesion = cache(async (): Promise<UsuarioSesion | null> => {
  const sesion = await auth.api.getSession({ headers: await headers() })
  if (!sesion?.user) return null

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    include: {
      rol: { include: { permisos: true } },
      sedes: true,
    },
  })
  if (!usuario) return null

  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.name,
    rolId: usuario.rolId,
    rolNombre: usuario.rol.nombre,
    estado: usuario.estado,
    debeCambiarPassword: usuario.debeCambiarPassword,
    colaboradorId: null, // se completa en F2 cuando exista el modelo Colaborador
    sedeIds: usuario.sedes.map((s) => s.sedeId),
    permisos: usuario.rol.permisos.map((p) => ({
      modulo: p.modulo,
      accion: p.accion as Accion,
      alcance: p.alcance as Alcance,
    })),
  }
})

/** Exige sesión activa; redirige a /login si no hay. Fuerza cambio de contraseña si aplica. */
export async function requerirSesion(): Promise<UsuarioSesion> {
  const usuario = await obtenerSesion()
  if (!usuario) redirect('/login')
  if (usuario.estado !== 'ACTIVO') redirect('/login?error=cuenta-inactiva')
  if (usuario.debeCambiarPassword) redirect('/cambiar-password')
  return usuario
}

export class ErrorPermiso extends Error {
  constructor(modulo: string, accion: string) {
    super(`Sin permiso: ${accion} en ${modulo}`)
    this.name = 'ErrorPermiso'
  }
}

/** Exige un permiso concreto; lanza ErrorPermiso si el rol no lo tiene. */
export async function requerirPermiso(modulo: ModuloClave, accion: Accion): Promise<UsuarioSesion> {
  const usuario = await requerirSesion()
  if (!tienePermiso(usuario, modulo, accion)) {
    throw new ErrorPermiso(modulo, accion)
  }
  return usuario
}

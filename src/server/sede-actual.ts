import 'server-only'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import type { UsuarioSesion } from '@/server/sesion'

const COOKIE = 'sede_actual'

export type OpcionSede = { id: string; nombre: string; ciudad: string }

/** Sedes que el usuario puede consultar según su alcance (todas o asignadas). */
export async function sedesDisponibles(usuario: UsuarioSesion): Promise<OpcionSede[]> {
  const verColaboradores = usuario.permisos.find(
    (p) => p.modulo === 'colaboradores' && p.accion === 'VER',
  )
  const restringido =
    verColaboradores &&
    (verColaboradores.alcance === 'SEDES_ASIGNADAS' || verColaboradores.alcance === 'EQUIPO')

  const sedes = await prisma.sede.findMany({
    where: {
      activa: true,
      ...(restringido ? { id: { in: usuario.sedeIds } } : {}),
    },
    include: { ciudad: true },
    orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
  })
  return sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))
}

/** Sede activa (cookie). `null` = "Todas las sedes". */
export async function sedeActualId(): Promise<string | null> {
  const c = await cookies()
  const valor = c.get(COOKIE)?.value
  return valor && valor !== 'todas' ? valor : null
}

export { COOKIE as COOKIE_SEDE }

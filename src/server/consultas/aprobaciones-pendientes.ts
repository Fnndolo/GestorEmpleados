import 'server-only'
import { prisma } from '@/lib/db'
import { tienePermiso, type UsuarioSesion } from '@/server/sesion'

/**
 * Cuántas solicitudes de autoservicio tienen un paso pendiente que ESTE usuario
 * puede resolver. Misma lógica de visibilidad que la bandeja de aprobaciones
 * (autoservicio/aprobaciones/page.tsx) — mantener ambas en sincronía.
 */
export async function contarAprobacionesPendientes(usuario: UsuarioSesion): Promise<number> {
  if (!tienePermiso(usuario, 'autoservicio', 'APROBAR')) return 0

  const esAdminRrhh = ['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)
  const solicitudes = await prisma.solicitud.findMany({
    where: { estado: 'EN_APROBACION', pasos: { some: { estado: 'PENDIENTE' } } },
    select: {
      colaborador: { select: { jefeInmediatoId: true } },
      pasos: { orderBy: { orden: 'asc' }, select: { estado: true, usaJefeInmediato: true, rolAprobador: true } },
    },
  })

  return solicitudes.filter((s) => {
    const pasoActual = s.pasos.find((p) => p.estado === 'PENDIENTE')
    if (!pasoActual) return false
    if (esAdminRrhh) return true
    if (pasoActual.usaJefeInmediato) return usuario.colaboradorId === s.colaborador.jefeInmediatoId
    return pasoActual.rolAprobador === usuario.rolNombre
  }).length
}

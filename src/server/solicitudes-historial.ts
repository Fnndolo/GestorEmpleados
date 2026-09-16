import 'server-only'
import { prisma } from '@/lib/db'
import { formatFechaCorta } from '@/lib/fechas'
import { fechaBreve, nombreCorto } from '@/lib/notificaciones/texto'
import { urlFoto } from '@/lib/foto'
import { iniciales } from '@/lib/etiquetas'
import { cuandoSolicitud, ESTADO_SOLICITUD, TIPO_SOLICITUD } from '@/lib/solicitudes-texto'
import type { HistorialItem } from '@/components/solicitudes/historial-solicitudes'
import type { UsuarioSesion } from '@/server/sesion'

/**
 * Historial de solicitudes de autoservicio ya con su texto listo para la
 * lista: sirve para la pestaña de la ficha (una persona) y para el archivo de
 * Aprobaciones (todas las que el usuario pudo resolver).
 */
export async function historialSolicitudes(opts: {
  colaboradorId?: string
  /** Estados a listar; por defecto todos. */
  estados?: string[]
  take?: number
}): Promise<HistorialItem[]> {
  const solicitudes = await prisma.solicitud.findMany({
    where: {
      ...(opts.colaboradorId ? { colaboradorId: opts.colaboradorId } : {}),
      ...(opts.estados ? { estado: { in: opts.estados as never[] } } : {}),
    },
    include: {
      pasos: { orderBy: { orden: 'asc' } },
      colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true, jefeInmediatoId: true } },
    },
    orderBy: { creadoEn: 'desc' },
    take: opts.take ?? 100,
  })

  // Quién decidió cada paso, en una sola consulta.
  const ids = [...new Set(solicitudes.flatMap((s) => s.pasos.map((p) => p.decididoPorId)).filter((x): x is string => !!x))]
  const usuarios = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
  const nombreDe = new Map(usuarios.map((u) => [u.id, u.name]))

  return solicitudes.map((s) => {
    const datos = s.datos as Record<string, string>
    const calc = (s.datos as Record<string, unknown>).calculoVacaciones as { dias?: number } | undefined
    return {
      id: s.id,
      tipo: s.tipo,
      tipoEtiqueta: TIPO_SOLICITUD[s.tipo] ?? s.tipo,
      estado: s.estado,
      estadoEtiqueta: ESTADO_SOLICITUD[s.estado] ?? s.estado,
      cuando: cuandoSolicitud(s.tipo, datos, calc?.dias ?? null),
      motivo: datos.motivo?.trim() || null,
      creadoEn: fechaBreve(s.creadoEn),
      resultado: s.resultado && !s.resultado.startsWith('Certificación generada:') ? s.resultado : null,
      colaborador: {
        id: s.colaborador.id,
        nombre: `${s.colaborador.nombres} ${s.colaborador.apellidos}`,
        nombreCorto: nombreCorto(s.colaborador.nombres, s.colaborador.apellidos),
        iniciales: iniciales(s.colaborador.nombres, s.colaborador.apellidos),
        fotoUrl: urlFoto(s.colaborador.id, s.colaborador.fotoPath, true),
        jefeInmediatoId: s.colaborador.jefeInmediatoId,
      },
      pasos: s.pasos.map((p) => ({
        rol: p.usaJefeInmediato ? 'Jefe inmediato' : p.rolAprobador ?? 'Aprobador',
        estado: p.estado,
        decididoPorId: p.decididoPorId,
        decididoPor: p.decididoPorId ? nombreDe.get(p.decididoPorId) ?? null : null,
        decididoEn: p.decididoEn ? formatFechaCorta(p.decididoEn) : null,
        comentario: p.comentario,
      })),
    }
  })
}

/**
 * Lo que un aprobador puede ver en el archivo: todo si es de Talento Humano,
 * administración o subgerencia; si es jefe, lo de su equipo y lo que él mismo
 * decidió.
 */
export function filtrarHistorialPara(usuario: UsuarioSesion, items: HistorialItem[]): HistorialItem[] {
  if (['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)) return items
  return items.filter((s) =>
    (usuario.colaboradorId && s.colaborador.jefeInmediatoId === usuario.colaboradorId) ||
    s.pasos.some((p) => p.decididoPorId === usuario.id),
  )
}

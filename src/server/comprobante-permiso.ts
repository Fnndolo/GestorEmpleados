import 'server-only'
import { prisma } from '@/lib/db'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import { hoyBogota } from '@/lib/fechas'
import { nombreCorto, fechaBreve } from '@/lib/notificaciones/texto'
import { fechaLimiteComprobante, PLAZO_COMPROBANTE_POR_DEFECTO } from '@/lib/comprobante-permiso'
import { avisar, avisarPorRol, notificarUsuario, usuarioDeColaborador } from '@/server/notificaciones/avisar'

/**
 * Comprobante de asistencia de un permiso — la parte que toca la base.
 * Las reglas puras (plazo, situación) están en `src/lib/comprobante-permiso.ts`.
 */

/** Roles de Talento Humano que reciben los avisos del comprobante. */
const ROLES_TH = ['Recursos Humanos', 'Administrador']

/** Plazo vigente en días hábiles (Ajustes → Empresa). */
export async function plazoComprobanteDias(): Promise<number> {
  const empresa = await prisma.configuracionEmpresa.findFirst({ select: { plazoComprobantePermisoDias: true } })
  return empresa?.plazoComprobantePermisoDias ?? PLAZO_COMPROBANTE_POR_DEFECTO
}

/**
 * Campos con que queda un permiso al que se le exige el comprobante: pendiente,
 * con la fecha límite calculada en días hábiles desde el día del permiso (o
 * desde hoy, si el permiso ya pasó).
 */
export async function comprobanteExigido(fechaPermiso: Date): Promise<{ comprobanteEstado: 'PENDIENTE'; comprobanteVence: Date }> {
  const hoy = hoyBogota()
  const anioHasta = Math.max(hoy.getUTCFullYear(), fechaPermiso.getUTCFullYear()) + 1
  const [empresa, festivos] = await Promise.all([
    prisma.configuracionEmpresa.findFirst({ select: { plazoComprobantePermisoDias: true, sabadoHabil: true } }),
    cargarFestivos(hoy.getUTCFullYear(), anioHasta),
  ])
  const vence = fechaLimiteComprobante(
    fechaPermiso,
    hoy,
    empresa?.plazoComprobantePermisoDias ?? PLAZO_COMPROBANTE_POR_DEFECTO,
    festivos,
    empresa?.sabadoHabil ?? true,
  )
  return { comprobanteEstado: 'PENDIENTE', comprobanteVence: vence }
}

/** Le dice al colaborador que debe subir el comprobante y hasta cuándo. */
export async function avisarComprobanteRequerido(colaboradorId: string, fechaPermiso: Date, vence: Date): Promise<void> {
  const usuarioId = await usuarioDeColaborador(colaboradorId)
  if (!usuarioId) return
  await avisar(usuarioId, {
    titulo: `Sube el comprobante de tu permiso del ${fechaBreve(fechaPermiso)}`,
    mensaje: `Plazo: hasta el ${fechaBreve(vence)} · Se sube desde "Mi actividad reciente".`,
    enlace: '/autoservicio',
    llamadoAccion: 'Subir el comprobante',
    evento: 'comprobante_permiso_requerido',
  })
}

/** Avisa a Talento Humano que hay un comprobante nuevo por verificar. */
export async function avisarComprobanteEntregado(colaboradorId: string, fechaPermiso: Date): Promise<void> {
  const colab = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
  await avisarPorRol(ROLES_TH, {
    titulo: `${nombreCorto(colab?.nombres, colab?.apellidos)} subió el comprobante de su permiso`,
    mensaje: `Permiso del ${fechaBreve(fechaPermiso)} · Acéptalo o devuélvelo en Novedades → Permisos.`,
    enlace: '/novedades?tab=permisos',
    llamadoAccion: 'Verificar el comprobante',
    evento: 'comprobante_permiso_entregado',
  })
}

/** Le cuenta al colaborador qué decidió Talento Humano sobre su comprobante. */
export async function avisarComprobanteRevisado(colaboradorId: string, fechaPermiso: Date, valido: boolean, nota: string | null): Promise<void> {
  const usuarioId = await usuarioDeColaborador(colaboradorId)
  if (!usuarioId) return
  await avisar(usuarioId, {
    titulo: valido ? 'Tu comprobante fue aceptado' : 'Tu comprobante no fue aceptado',
    mensaje: valido
      ? `Permiso del ${fechaBreve(fechaPermiso)}${nota ? ` · ${nota}` : ''}`
      : `Permiso del ${fechaBreve(fechaPermiso)} · ${nota ?? 'No acredita la asistencia'} · Sube uno corregido.`,
    enlace: '/autoservicio',
    llamadoAccion: valido ? 'Ver mi actividad' : 'Subir otro comprobante',
    evento: 'comprobante_permiso_revisado',
  })
}

/**
 * Cron diario: permisos con comprobante pendiente cuyo plazo ya venció. Por
 * ahora la única consecuencia es avisar a Talento Humano; el aviso se repite una
 * vez por semana por permiso (dedupeKey con el número de semana) hasta que el
 * colaborador entregue el comprobante o Talento Humano deje de exigirlo.
 */
export async function alertarComprobantesPermisoVencidos(): Promise<{ vencidos: number }> {
  const hoy = hoyBogota()
  const semana = Math.floor(hoy.getTime() / (7 * 86_400_000))

  const vencidos = await prisma.permiso.findMany({
    where: { comprobanteEstado: 'PENDIENTE', comprobanteVence: { lt: hoy } },
    select: { id: true, fecha: true, comprobanteVence: true, colaborador: { select: { nombres: true, apellidos: true } } },
  })
  if (vencidos.length === 0) return { vencidos: 0 }

  const destinatarios = await prisma.user.findMany({
    where: { estado: 'ACTIVO', rol: { nombre: { in: ROLES_TH } } },
    select: { id: true },
  })

  for (const p of vencidos) {
    const vence = p.comprobanteVence!
    const dias = Math.floor((hoy.getTime() - vence.getTime()) / 86_400_000)
    const persona = nombreCorto(p.colaborador.nombres, p.colaborador.apellidos)
    for (const u of destinatarios) {
      await notificarUsuario(
        u.id,
        `${persona} no ha entregado el comprobante de su permiso`,
        `Permiso del ${fechaBreve(p.fecha)} · Plazo vencido el ${fechaBreve(vence)} (hace ${dias} día${dias === 1 ? '' : 's'}).`,
        '/novedades?tab=permisos',
        `comprobante_permiso_vencido:${p.id}:${u.id}:${semana}`,
        'comprobante_permiso_vencido',
      )
    }
  }
  return { vencidos: vencidos.length }
}

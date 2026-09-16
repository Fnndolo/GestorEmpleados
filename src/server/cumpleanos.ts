import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { hoyBogota } from '@/lib/fechas'
import { nombreCorto, fechaBreve } from '@/lib/notificaciones/texto'
import { fmtCOP } from '@/lib/moneda'

/**
 * Cumpleaños: Talento Humano le encarga a un colaborador la celebración del
 * cumpleaños de otro; el encargado organiza y después sube las facturas de lo
 * que compró con el valor total; TH las revisa y cierra.
 *
 * Es el mismo molde del comprobante de asistencia de los permisos (TH pide un
 * documento, la persona lo sube desde su autoservicio, TH acepta o devuelve),
 * con dos diferencias pedidas: no hay plazo para las facturas —solo un
 * recordatorio antes del cumpleaños— y TH cierra cuando quiera.
 */

const ROLES_TH = ['Recursos Humanos', 'Administrador']

/** Con cuántos días de anticipación se recuerda un cumpleaños (Ajustes → Empresa). */
export async function diasRecordatorioCumpleanos(): Promise<number> {
  const cfg = await prisma.configuracionEmpresa.findFirst({ select: { diasRecordatorioCumpleanos: true } })
  return cfg?.diasRecordatorioCumpleanos ?? 3
}

/**
 * El cumpleaños de una persona en un año dado: su fecha de nacimiento con el
 * año cambiado. Un 29 de febrero cae en 1 de marzo los años que no lo tienen,
 * que es como lo celebra todo el mundo.
 */
export function cumpleanosEnAnio(fechaNacimiento: Date, anio: number): Date {
  return new Date(Date.UTC(anio, fechaNacimiento.getUTCMonth(), fechaNacimiento.getUTCDate()))
}

export type CumpleanosProximo = {
  colaborador: { id: string; nombres: string; apellidos: string; fotoPath: string | null; sede: string; cargo: string | null }
  fecha: Date
  anio: number
  /** Cuántos años cumple. */
  edad: number
}

/**
 * Los cumpleaños que caen entre dos fechas, sacados de las fechas de nacimiento
 * de los colaboradores activos. Se recorren los años que toque el rango, para
 * que el paso de diciembre a enero no deje a nadie fuera. Quien no tiene fecha
 * de nacimiento en su ficha no aparece: eso mismo sirve para detectarlo.
 */
export async function cumpleanosEntre(desde: Date, hasta: Date, where: Record<string, unknown> = {}): Promise<CumpleanosProximo[]> {
  const colaboradores = await prisma.colaborador.findMany({
    where: { estado: 'ACTIVO', fechaNacimiento: { not: null }, ...where },
    select: {
      id: true, nombres: true, apellidos: true, fotoPath: true, fechaNacimiento: true,
      sede: { select: { nombre: true } }, cargo: { select: { nombre: true } },
    },
  })
  const lista: CumpleanosProximo[] = []
  for (const c of colaboradores) {
    for (let anio = desde.getUTCFullYear(); anio <= hasta.getUTCFullYear(); anio++) {
      const fecha = cumpleanosEnAnio(c.fechaNacimiento!, anio)
      if (fecha < desde || fecha > hasta) continue
      lista.push({
        colaborador: { id: c.id, nombres: c.nombres, apellidos: c.apellidos, fotoPath: c.fotoPath, sede: c.sede.nombre, cargo: c.cargo?.nombre ?? null },
        fecha, anio, edad: anio - c.fechaNacimiento!.getUTCFullYear(),
      })
    }
  }
  return lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.colaborador.apellidos.localeCompare(b.colaborador.apellidos))
}

async function nombreDe(colaboradorId: string): Promise<string> {
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
  return nombreCorto(c?.nombres, c?.apellidos)
}

/** Le dice al encargado qué cumpleaños tiene a cargo y qué se espera de él. */
export async function avisarEncargadoAsignado(opts: { encargadoId: string; homenajeadoId: string; fecha: Date; nota: string | null }): Promise<void> {
  const uid = await usuarioDeColaborador(opts.encargadoId)
  if (!uid) return
  const homenajeado = await nombreDe(opts.homenajeadoId)
  await avisar(uid, {
    titulo: `Cumpleaños de ${homenajeado} a tu cargo`,
    mensaje: `${fechaBreve(opts.fecha)}${opts.nota ? ` · ${opts.nota}` : ''} · Después sube las facturas desde tu autoservicio.`,
    enlace: '/autoservicio',
    llamadoAccion: 'Ver el cumpleaños a mi cargo',
    evento: 'cumpleanos_encargado_asignado',
  })
}

/** Avisa a Talento Humano que hay facturas por revisar. */
export async function avisarFacturasEntregadas(opts: { encargadoId: string; homenajeadoId: string; valor: number | null }): Promise<void> {
  const [encargado, homenajeado] = await Promise.all([nombreDe(opts.encargadoId), nombreDe(opts.homenajeadoId)])
  await avisarPorRol(ROLES_TH, {
    titulo: `${encargado} subió las facturas del cumpleaños de ${homenajeado}`,
    mensaje: `${opts.valor != null ? `${fmtCOP(opts.valor)} · ` : ''}Acéptalas o devuélvelas en Cumpleaños.`,
    enlace: '/cumpleanos',
    llamadoAccion: 'Revisar las facturas',
    evento: 'cumpleanos_facturas_entregadas',
  })
}

/** Le cuenta al encargado qué decidió Talento Humano sobre sus facturas. */
export async function avisarFacturasRevisadas(opts: { encargadoId: string; homenajeadoId: string; aceptadas: boolean; motivo: string | null }): Promise<void> {
  const uid = await usuarioDeColaborador(opts.encargadoId)
  if (!uid) return
  const homenajeado = await nombreDe(opts.homenajeadoId)
  await avisar(uid, {
    titulo: opts.aceptadas ? 'Tus facturas del cumpleaños fueron aceptadas' : 'Tus facturas del cumpleaños fueron devueltas',
    mensaje: opts.aceptadas
      ? `Cumpleaños de ${homenajeado} · Gracias por organizarlo.`
      : `Cumpleaños de ${homenajeado}${opts.motivo ? ` · ${opts.motivo}` : ''} · Súbelas de nuevo desde tu autoservicio.`,
    enlace: '/autoservicio',
    llamadoAccion: opts.aceptadas ? 'Ver' : 'Volver a subir las facturas',
    evento: 'cumpleanos_facturas_revisadas',
  })
}

/**
 * Recuerda al encargado los cumpleaños que se acercan. Corre a diario desde el
 * cron; cada celebración se recuerda una sola vez, cuando faltan los días
 * configurados o menos (así un cumpleaños asignado con poca anticipación
 * también recibe su aviso).
 */
export async function recordarCumpleanosProximos(): Promise<{ recordados: number }> {
  const hoy = hoyBogota()
  const dias = await diasRecordatorioCumpleanos()
  const limite = new Date(hoy); limite.setUTCDate(limite.getUTCDate() + dias)
  const pendientes = await prisma.celebracionCumpleanos.findMany({
    where: { estado: 'ASIGNADA', recordatorioEnviadoEn: null, fecha: { gte: hoy, lte: limite } },
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
  })
  let recordados = 0
  for (const c of pendientes) {
    const uid = await usuarioDeColaborador(c.encargadoId)
    if (uid) {
      const faltan = Math.round((c.fecha.getTime() - hoy.getTime()) / 86_400_000)
      await avisar(uid, {
        titulo: `${nombreCorto(c.colaborador.nombres, c.colaborador.apellidos)} cumple años ${faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : `en ${faltan} días`}`,
        mensaje: `${fechaBreve(c.fecha)}${c.nota ? ` · ${c.nota}` : ''} · Recuerda subir las facturas después.`,
        enlace: '/autoservicio',
        llamadoAccion: 'Ver el cumpleaños a mi cargo',
        evento: 'cumpleanos_recordatorio',
      }).catch(() => {})
      recordados++
    }
    // Se marca aunque no haya usuario a quien avisar: no tiene sentido reintentar cada día.
    await dbAuditado.celebracionCumpleanos.update({ where: { id: c.id }, data: { recordatorioEnviadoEn: new Date() } })
  }
  return { recordados }
}

/** Clave estable del cumpleaños de una persona en un año, para casar la lista con las celebraciones. */
export function claveCumpleanos(colaboradorId: string, anio: number): string {
  return `${colaboradorId}:${anio}`
}

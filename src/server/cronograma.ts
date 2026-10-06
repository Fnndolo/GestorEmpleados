import 'server-only'
import { prisma } from '@/lib/db'
import { urlFoto } from '@/lib/foto'
import { auditar, dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { crucesDeTurnos, diasEspecialesDelMes, mesesVecinos, type DiaEspecial, type TurnosPorPersona } from '@/lib/cronograma'
import { trabajaDia, type DiasHorario } from '@/lib/horarios'
import { formatFechaISO, parseFechaISO, hoyBogota } from '@/lib/fechas'
import { VINCULOS_SIN_HORARIO } from '@/server/horarios'

/**
 * Cronograma de domingos y festivos, por sede y por mes: quién trabaja cada
 * uno. Se arma antes de que empiece el mes y se publica: a cada persona le
 * llega el aviso con sus días. La regla (nadie en dos seguidos) está en
 * `@/lib/cronograma`; aquí se le suman los bordes con los meses vecinos, que
 * viven en la base.
 */

export type PersonaCronograma = {
  id: string
  nombre: string
  /** Primer nombre y primer apellido: lo que cabe en el celular. */
  corto: string
  cargo: string | null
  /** Miniatura de la foto (null si no tiene). */
  fotoUrl: string | null
  /** ¿Su horario incluye el domingo? (Solo orienta: el cronograma manda.) */
  trabajaDomingo: boolean | null
}

export type Vecino = { fecha: string; ids: string[] } | null

async function especialesDe(mes: string): Promise<DiaEspecial[]> {
  const anio = Number(mes.slice(0, 4))
  return diasEspecialesDelMes(mes, await cargarFestivos(anio - 1, anio + 1))
}

/** Quiénes entran al cronograma de una sede: los activos con vínculo laboral. */
export async function personasDelCronograma(sedeId: string): Promise<PersonaCronograma[]> {
  const hoy = hoyBogota()
  const colabs = await prisma.colaborador.findMany({
    where: { sedeId, estado: 'ACTIVO', tipoVinculo: { notIn: [...VINCULOS_SIN_HORARIO] } },
    select: {
      id: true, nombres: true, apellidos: true, fotoPath: true, cargo: { select: { nombre: true } },
      asignacionesHorario: {
        where: { desde: { lte: hoy }, OR: [{ hasta: null }, { hasta: { gte: hoy } }] },
        orderBy: { desde: 'desc' }, take: 1, select: { dias: true },
      },
    },
    orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
  })
  return colabs.map((c) => ({
    id: c.id,
    nombre: `${c.nombres} ${c.apellidos}`,
    corto: `${c.nombres.trim().split(/\s+/)[0]} ${c.apellidos.trim().split(/\s+/)[0] ?? ''}`.trim(),
    cargo: c.cargo?.nombre ?? null,
    fotoUrl: urlFoto(c.id, c.fotoPath, true),
    trabajaDomingo: c.asignacionesHorario[0] ? trabajaDia(c.asignacionesHorario[0].dias as DiasHorario, 0) : null,
  }))
}

/** Quiénes (de `ids`) trabajan una fecha, en cualquier sede. */
async function quienesTrabajan(fecha: string | undefined, ids: string[]): Promise<Vecino> {
  if (!fecha) return null
  const turnos = await prisma.turnoDominical.findMany({ where: { fecha: parseFechaISO(fecha)!, colaboradorId: { in: ids } }, select: { colaboradorId: true } })
  return { fecha, ids: turnos.map((t) => t.colaboradorId) }
}

/** Todo lo que pinta la grilla de un mes en una sede. */
export async function datosCronograma(sedeId: string, mes: string) {
  const especiales = await especialesDe(mes)
  const personas = await personasDelCronograma(sedeId)
  const ids = personas.map((p) => p.id)
  const { anterior, siguiente } = mesesVecinos(mes)
  const [antes, despues] = await Promise.all([
    especialesDe(anterior).then((d) => quienesTrabajan(d.at(-1)?.fecha, ids)),
    especialesDe(siguiente).then((d) => quienesTrabajan(d[0]?.fecha, ids)),
  ])
  const [desde, hasta] = rangoMes(mes)
  const turnos = await prisma.turnoDominical.findMany({ where: { sedeId, fecha: { gte: desde, lte: hasta } }, select: { colaboradorId: true, fecha: true } })
  const porPersona: TurnosPorPersona = {}
  for (const t of turnos) (porPersona[t.colaboradorId] ??= []).push(formatFechaISO(t.fecha))
  const cronograma = await prisma.cronogramaDominical.findUnique({ where: { sedeId_mes: { sedeId, mes } } })
  const avisados = (cronograma?.avisados ?? {}) as TurnosPorPersona
  const pendientesDeAviso = cronograma?.publicadoEn ? personasConCambios(porPersona, avisados).length : 0
  return {
    especiales, personas, turnos: porPersona, antes, despues,
    publicadoEn: cronograma?.publicadoEn ?? null,
    pendientesDeAviso,
  }
}

function rangoMes(mes: string): [Date, Date] {
  const [a, m] = mes.split('-').map(Number)
  return [new Date(Date.UTC(a, m - 1, 1)), new Date(Date.UTC(a, m, 0))]
}

const iguales = (a: string[] = [], b: string[] = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Quiénes tienen días distintos a los que se les avisaron (incluidos los que ya no tienen ninguno). */
function personasConCambios(actuales: TurnosPorPersona, avisados: TurnosPorPersona): string[] {
  const ids = new Set([...Object.keys(actuales), ...Object.keys(avisados)])
  return [...ids].filter((id) => !iguales(actuales[id], avisados[id]))
}

/**
 * Guarda el cronograma de un mes en una sede (reemplaza lo que había). Valida
 * que los días sean domingos o festivos del mes, que las personas sean de la
 * sede y la regla: nadie en dos seguidos, mirando también el último día del
 * mes anterior y el primero del siguiente.
 */
export async function guardarCronograma(opts: { sedeId: string; mes: string; turnos: TurnosPorPersona; usuarioId: string }): Promise<{ turnos: number }> {
  const especiales = await especialesDe(opts.mes)
  const validas = new Set(especiales.map((d) => d.fecha))
  const personas = await personasDelCronograma(opts.sedeId)
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]))

  const limpios: TurnosPorPersona = {}
  for (const [id, fechas] of Object.entries(opts.turnos)) {
    if (!nombre.has(id)) throw new ErrorNegocio('Una de las personas no es de esta sede o ya no está activa. Recarga la página.')
    const suyas = [...new Set(fechas)]
    if (suyas.some((f) => !validas.has(f))) throw new ErrorNegocio('Solo se asignan domingos y festivos del mes.')
    if (suyas.length) limpios[id] = suyas
  }

  // La regla, con los bordes del mes.
  const { anterior, siguiente } = mesesVecinos(opts.mes)
  const ids = Object.keys(limpios)
  const [antes, despues] = await Promise.all([
    especialesDe(anterior).then((d) => quienesTrabajan(d.at(-1)?.fecha, ids)),
    especialesDe(siguiente).then((d) => quienesTrabajan(d[0]?.fecha, ids)),
  ])
  const secuencia = [...(antes ? [antes.fecha] : []), ...especiales.map((d) => d.fecha), ...(despues ? [despues.fecha] : [])]
  const conBordes: TurnosPorPersona = Object.fromEntries(ids.map((id) => [id, [
    ...limpios[id],
    ...(antes?.ids.includes(id) ? [antes.fecha] : []),
    ...(despues?.ids.includes(id) ? [despues.fecha] : []),
  ]]))
  const cruces = crucesDeTurnos(conBordes, secuencia)
  if (cruces.length) {
    const c = cruces[0]
    throw new ErrorNegocio(`${nombre.get(c.colaboradorId)} quedaría en dos domingos/festivos seguidos (${c.fechas.map(fechaCorta).join(' y ')}). Nadie puede trabajar dos seguidos.`)
  }

  const [desde, hasta] = rangoMes(opts.mes)
  const filas = Object.entries(limpios).flatMap(([colaboradorId, fechas]) =>
    fechas.map((f) => ({ fecha: parseFechaISO(f)!, colaboradorId, sedeId: opts.sedeId, creadoPorId: opts.usuarioId })))
  await prisma.$transaction(async (tx) => {
    await tx.turnoDominical.deleteMany({ where: { sedeId: opts.sedeId, fecha: { gte: desde, lte: hasta } } })
    // Quien estaba en otra sede esos días: su turno de aquí reemplaza el de allá.
    if (filas.length) {
      await tx.turnoDominical.deleteMany({ where: { OR: filas.map((f) => ({ fecha: f.fecha, colaboradorId: f.colaboradorId })) } })
      await tx.turnoDominical.createMany({ data: filas })
    }
  })
  const cronograma = await dbAuditado.cronogramaDominical.upsert({
    where: { sedeId_mes: { sedeId: opts.sedeId, mes: opts.mes } },
    create: { sedeId: opts.sedeId, mes: opts.mes },
    update: { mes: opts.mes },
  })
  // El reemplazo de turnos es masivo y el cliente auditado no lo registra solo: queda la foto completa.
  await auditar('EDITAR', 'TurnoDominical', {
    registroId: cronograma.id,
    descripcion: `Cronograma ${opts.mes}: ${Object.entries(limpios).map(([id, f]) => `${nombre.get(id)} (${[...f].sort().map(fechaCorta).join(', ')})`).join('; ') || 'sin turnos'}`,
  })
  return { turnos: filas.length }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "dom 1 nov". */
function fechaCorta(f: string): string {
  const d = parseFechaISO(f)!
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`
}

export type AvisoCronograma = { colaboradorId: string; nombre: string; usuarioId: string | null; titulo: string; mensaje: string }

/**
 * Los avisos que saldrían al publicar estos turnos: uno por persona a la que le
 * cambiaron los días desde la última publicación (o a todas, la primera vez),
 * con el mismo texto que le llega. Lo usan la vista previa y la publicación.
 */
export async function avisosDelCronograma(sedeId: string, mes: string, turnos: TurnosPorPersona): Promise<AvisoCronograma[]> {
  const [especiales, personas, previo] = await Promise.all([
    especialesDe(mes),
    personasDelCronograma(sedeId),
    prisma.cronogramaDominical.findUnique({ where: { sedeId_mes: { sedeId, mes } } }),
  ])
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]))
  const delMes = Object.fromEntries(Object.entries(turnos).filter(([id]) => nombres.has(id)))
  const festivo = new Set(especiales.filter((d) => d.festivo && !d.domingo).map((d) => d.fecha))
  const avisadosAntes = (previo?.avisados ?? {}) as TurnosPorPersona
  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1]
  const avisos: AvisoCronograma[] = []
  for (const id of personasConCambios(delMes, avisadosAntes)) {
    if (!nombres.has(id)) continue
    const fechas = [...(delMes[id] ?? [])].sort()
    const lista = fechas.map((f) => `${fechaCorta(f).replace(/ \w+$/, '')}${festivo.has(f) ? ' (festivo)' : ''}`)
    avisos.push({
      colaboradorId: id,
      nombre: nombres.get(id)!,
      usuarioId: await usuarioDeColaborador(id),
      ...(fechas.length
        ? { titulo: `Tus domingos y festivos de ${nombreMes}`, mensaje: `Te toca trabajar: ${lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : lista[0]}.` }
        : { titulo: `Cambió tu cronograma de ${nombreMes}`, mensaje: `Ya no te toca trabajar ningún domingo ni festivo en ${nombreMes}.` }),
    })
  }
  return avisos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Publica el cronograma: le avisa a cada persona sus domingos y festivos del
 * mes. Al volver a publicar solo le llega a quien le cambiaron los días (y a
 * quien se los quitaron todos).
 */
export async function publicarCronograma(opts: { sedeId: string; mes: string; usuarioId: string }): Promise<{ avisados: number }> {
  const { turnos } = await datosCronograma(opts.sedeId, opts.mes)
  let avisados = 0
  for (const a of await avisosDelCronograma(opts.sedeId, opts.mes, turnos)) {
    if (!a.usuarioId) continue
    await avisar(a.usuarioId, { titulo: a.titulo, mensaje: a.mensaje, evento: 'cronograma_dominical', colaboradorId: a.colaboradorId }).catch(() => {})
    avisados++
  }
  await dbAuditado.cronogramaDominical.upsert({
    where: { sedeId_mes: { sedeId: opts.sedeId, mes: opts.mes } },
    create: { sedeId: opts.sedeId, mes: opts.mes, publicadoEn: new Date(), publicadoPorId: opts.usuarioId, avisados: turnos },
    update: { publicadoEn: new Date(), publicadoPorId: opts.usuarioId, avisados: turnos },
  })
  return { avisados }
}

import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { renderCambioHorario } from '@/server/pdf/cambio-horario'
import {
  conexionAsistencia, horariosAsistencia, jornadasAsistencia, normalizarCedula, ponerJornadaAsistencia, ErrorAsistencia,
} from '@/server/asistencia/cliente'
import { horasSemana, mismosDias, resumenHorario, textoHoras, validarDias, type DiasHorario } from '@/lib/horarios'
import { formatFechaISO, hoyBogota } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'

/**
 * Horarios de las personas.
 *
 * Cada asignación guarda su copia de los días y una fecha desde; la anterior se
 * cierra el día antes. La de hoy se le manda a AsistencIA, que es donde se
 * calculan las horas extra: si allá quedara el horario viejo, se pagarían mal.
 * Un cambio con fecha futura se manda el día que empieza (cron diario), no
 * antes, para no cambiarle allá el horario de los días que faltan.
 */

/** Vínculos sin horario: al contratista OPS no se le fija jornada (su autonomía es lo que lo separa de un contrato de trabajo). */
export const VINCULOS_SIN_HORARIO = ['OPS'] as const

const unDia = 86_400_000

/** La asignación que rige hoy para una persona, o null. */
export async function horarioDeHoy(colaboradorId: string) {
  const hoy = hoyBogota()
  return prisma.asignacionHorario.findFirst({
    where: { colaboradorId, desde: { lte: hoy }, OR: [{ hasta: null }, { hasta: { gte: hoy } }] },
    orderBy: { desde: 'desc' },
    include: { horario: { select: { nombre: true } } },
  })
}

type ResultadoSincronizacion = 'enviado' | 'programado' | 'sin-asistencia' | { error: string }

/** Le manda a AsistencIA la jornada de una asignación (si ya rige y hay conexión). */
async function sincronizar(asignacionId: string): Promise<ResultadoSincronizacion> {
  const a = await prisma.asignacionHorario.findUniqueOrThrow({
    where: { id: asignacionId },
    include: { colaborador: { select: { numeroDocumento: true } } },
  })
  if (a.desde > hoyBogota()) return 'programado'
  if (!(await conexionAsistencia('horarios'))) return 'sin-asistencia'
  try {
    await ponerJornadaAsistencia(a.colaborador.numeroDocumento, a.dias as Record<string, unknown>)
    await prisma.asignacionHorario.update({ where: { id: a.id }, data: { sincronizadoEn: new Date(), errorSincronizacion: null } })
    return 'enviado'
  } catch (e) {
    const error = e instanceof ErrorAsistencia ? e.message : 'AsistencIA no respondió.'
    await prisma.asignacionHorario.update({ where: { id: a.id }, data: { errorSincronizacion: error } })
    return { error }
  }
}

/**
 * Le asigna a una persona un horario desde una fecha: una plantilla (copia sus
 * días) o uno propio. Cierra el anterior el día antes; si ya había uno desde esa
 * misma fecha, lo corrige en vez de apilar otro. Opcionalmente le genera y le
 * envía la comunicación del cambio.
 */
export async function asignarHorario(opts: {
  colaboradorId: string
  horarioId: string | null
  /** Solo para un horario propio (sin plantilla). */
  dias?: unknown
  desde: Date
  motivo: string | null
  enviarComunicacion: boolean
  usuarioId: string
}): Promise<{ asignacionId: string; asistencia: ResultadoSincronizacion; documentoId: string | null }> {
  const colab = await prisma.colaborador.findUniqueOrThrow({
    where: { id: opts.colaboradorId },
    select: { id: true, tipoVinculo: true, estado: true },
  })
  if ((VINCULOS_SIN_HORARIO as readonly string[]).includes(colab.tipoVinculo)) {
    throw new ErrorNegocio('A un contratista OPS no se le asigna horario: fijarle jornada es un indicio de relación laboral.')
  }

  let dias: DiasHorario
  if (opts.horarioId) {
    const plantilla = await prisma.horario.findUniqueOrThrow({ where: { id: opts.horarioId } })
    if (!plantilla.activo) throw new ErrorNegocio('Ese horario está desactivado.')
    dias = plantilla.dias as DiasHorario
  } else {
    const v = validarDias(opts.dias)
    if ('error' in v) throw new ErrorNegocio(v.error)
    dias = v.dias
  }

  const ultima = await prisma.asignacionHorario.findFirst({ where: { colaboradorId: colab.id }, orderBy: { desde: 'desc' } })
  if (ultima && opts.desde < ultima.desde) {
    throw new ErrorNegocio(`Ya tiene un horario desde el ${fechaBreve(ultima.desde)}: el cambio debe empezar ese día o después.`)
  }

  let asignacionId: string
  let anterior: { dias: DiasHorario } | null = null
  if (ultima && ultima.desde.getTime() === opts.desde.getTime()) {
    // Mismo día: es una corrección del cambio, no otro cambio.
    const previa = await prisma.asignacionHorario.findFirst({ where: { colaboradorId: colab.id, desde: { lt: opts.desde } }, orderBy: { desde: 'desc' } })
    anterior = previa ? { dias: previa.dias as DiasHorario } : null
    await dbAuditado.asignacionHorario.update({
      where: { id: ultima.id },
      data: { horarioId: opts.horarioId, dias, motivo: opts.motivo, origen: 'MANUAL', sincronizadoEn: null, errorSincronizacion: null, asignadoPorId: opts.usuarioId },
    })
    asignacionId = ultima.id
  } else {
    if (ultima) {
      anterior = { dias: ultima.dias as DiasHorario }
      await dbAuditado.asignacionHorario.update({ where: { id: ultima.id }, data: { hasta: new Date(opts.desde.getTime() - unDia) } })
    }
    const nueva = await dbAuditado.asignacionHorario.create({
      data: { colaboradorId: colab.id, horarioId: opts.horarioId, dias, desde: opts.desde, motivo: opts.motivo, origen: 'MANUAL', asignadoPorId: opts.usuarioId },
    })
    asignacionId = nueva.id
  }

  const asistencia = await sincronizar(asignacionId)
  const documentoId = opts.enviarComunicacion ? await enviarComunicacion(asignacionId, anterior?.dias ?? null, opts.usuarioId) : null
  return { asignacionId, asistencia, documentoId }
}

/** El PDF de la comunicación del cambio: el mismo para la vista previa y para el que se envía. */
async function pdfComunicacion(d: { colaboradorId: string; horario: string; dias: DiasHorario; desde: Date; motivo: string | null; anteriores: DiasHorario | null }): Promise<Buffer> {
  const c = await prisma.colaborador.findUniqueOrThrow({
    where: { id: d.colaboradorId },
    select: { nombres: true, apellidos: true, numeroDocumento: true, cargo: { select: { nombre: true } }, sede: { select: { ciudad: { select: { nombre: true } } } } },
  })
  const empresa = await prisma.configuracionEmpresa.findFirstOrThrow()
  return renderCambioHorario({
    empresa: {
      razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial, nit: empresa.nit,
      direccion: empresa.direccion, telefono: empresa.telefono, emailContacto: empresa.emailContacto, sitioWeb: empresa.sitioWeb,
    },
    colaborador: {
      nombre: `${c.nombres} ${c.apellidos}`,
      documento: /^\d+$/.test(c.numeroDocumento) ? Number(c.numeroDocumento).toLocaleString('es-CO') : c.numeroDocumento,
      cargo: c.cargo?.nombre ?? null,
    },
    ciudad: c.sede.ciudad.nombre,
    fecha: hoyBogota(),
    desde: d.desde,
    horario: d.horario,
    resumen: resumenHorario(d.dias),
    horasSemana: textoHoras(horasSemana(d.dias)),
    anterior: d.anteriores ? resumenHorario(d.anteriores) : null,
    motivo: d.motivo,
    dias: d.dias,
  })
}

/**
 * La comunicación tal como saldría, sin guardar nada: para revisarla antes de
 * asignar. El horario anterior es el que tenga vigente antes de esa fecha.
 */
export async function vistaPreviaComunicacion(opts: { colaboradorId: string; horarioId: string | null; dias?: unknown; desde: Date; motivo: string | null }): Promise<Buffer> {
  let dias: DiasHorario
  let nombre = 'Horario propio'
  if (opts.horarioId) {
    const plantilla = await prisma.horario.findUniqueOrThrow({ where: { id: opts.horarioId } })
    dias = plantilla.dias as DiasHorario
    nombre = plantilla.nombre
  } else {
    const v = validarDias(opts.dias)
    if ('error' in v) throw new ErrorNegocio(v.error)
    dias = v.dias
  }
  const previa = await prisma.asignacionHorario.findFirst({ where: { colaboradorId: opts.colaboradorId, desde: { lt: opts.desde } }, orderBy: { desde: 'desc' } })
  return pdfComunicacion({ colaboradorId: opts.colaboradorId, horario: nombre, dias, desde: opts.desde, motivo: opts.motivo, anteriores: (previa?.dias as DiasHorario | undefined) ?? null })
}

/** Genera el PDF de la comunicación del cambio, lo guarda en los documentos de la persona y le avisa. */
async function enviarComunicacion(asignacionId: string, diasAnteriores: DiasHorario | null, usuarioId: string): Promise<string> {
  const a = await prisma.asignacionHorario.findUniqueOrThrow({
    where: { id: asignacionId },
    include: { horario: { select: { nombre: true } }, colaborador: { select: { id: true, sedeId: true } } },
  })
  const dias = a.dias as DiasHorario
  const c = a.colaborador
  const pdf = await pdfComunicacion({ colaboradorId: c.id, horario: a.horario?.nombre ?? 'Horario propio', dias, desde: a.desde, motivo: a.motivo, anteriores: diasAnteriores })
  const archivo = await subirArchivo(`colaborador/${c.id}/horarios`, `cambio-horario-${formatFechaISO(a.desde)}.pdf`, pdf, 'application/pdf')
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'Colaborador', entidadId: c.id, nombre: `Cambio de horario · desde ${fechaBreve(a.desde)}`,
      bucket: archivo.bucket, storagePath: archivo.storagePath, mimeType: 'application/pdf', tamanoBytes: archivo.tamanoBytes,
      nivelAcceso: 'GENERAL', sedeId: c.sedeId, subidoPorId: usuarioId,
    },
  })
  await dbAuditado.asignacionHorario.update({ where: { id: a.id }, data: { documentoId: doc.id } })
  const uid = await usuarioDeColaborador(c.id)
  if (uid) {
    await avisar(uid, {
      titulo: 'Tienes un horario nuevo',
      mensaje: `Desde el ${fechaBreve(a.desde)} · ${resumenHorario(dias)}`,
      enlace: '/autoservicio/documentos', llamadoAccion: 'Ver la comunicación', evento: 'horario_cambiado', colaboradorId: c.id,
    }).catch(() => {})
  }
  return doc.id
}

/** Deshace un cambio programado (que todavía no empieza): la asignación anterior vuelve a quedar abierta. */
export async function cancelarCambioProgramado(asignacionId: string): Promise<void> {
  const a = await prisma.asignacionHorario.findUniqueOrThrow({ where: { id: asignacionId } })
  if (a.desde <= hoyBogota()) throw new ErrorNegocio('Ese horario ya empezó: para cambiarlo, asigna otro.')
  const previa = await prisma.asignacionHorario.findFirst({ where: { colaboradorId: a.colaboradorId, desde: { lt: a.desde } }, orderBy: { desde: 'desc' } })
  await dbAuditado.asignacionHorario.delete({ where: { id: a.id } })
  if (previa) await dbAuditado.asignacionHorario.update({ where: { id: previa.id }, data: { hasta: null } })
}

/**
 * Cron diario: manda a AsistencIA los horarios que ya rigen y no han llegado
 * allá (los programados que empezaron hoy, y los que fallaron antes).
 */
export async function sincronizarHorariosPendientes(): Promise<{ enviados: number; fallidos: number }> {
  if (!(await conexionAsistencia('horarios'))) return { enviados: 0, fallidos: 0 }
  const pendientes = await prisma.asignacionHorario.findMany({
    where: { sincronizadoEn: null, desde: { lte: hoyBogota() }, hasta: null },
    select: { id: true },
  })
  let enviados = 0
  let fallidos = 0
  for (const p of pendientes) {
    const r = await sincronizar(p.id)
    if (r === 'enviado') enviados++
    else if (typeof r === 'object') fallidos++
  }
  return { enviados, fallidos }
}

export type ResumenImportacion = {
  plantillasNuevas: number
  plantillasActualizadas: number
  personasActualizadas: number
  personasIguales: number
  /** En AsistencIA, sin ficha aquí con esa cédula. */
  sinFicha: string[]
  /** Con solo la franja uniforme allá (sin horario por días): no se pueden traer. */
  sinDias: string[]
  /** Contratistas OPS: aquí no llevan horario. */
  ops: number
}

/**
 * Trae de AsistencIA las plantillas de horario y la jornada de cada persona.
 * Lo que allá está igual que aquí no se toca; lo distinto se registra como un
 * cambio desde hoy, con origen AsistencIA (y ya sincronizado: viene de allá).
 */
export async function importarDeAsistencia(usuarioId: string, soloColaboradorId?: string): Promise<ResumenImportacion> {
  const conexion = await conexionAsistencia('horarios')
  if (!conexion) throw new ErrorNegocio('AsistencIA no está conectada, o compartir horarios está apagado: revísalo en Ajustes → Integraciones.')
  // Para una sola persona no se tocan las plantillas: solo su jornada.
  const solo = soloColaboradorId ? await prisma.colaborador.findUniqueOrThrow({ where: { id: soloColaboradorId }, select: { numeroDocumento: true } }) : null
  const [plantillas, todasJornadas] = await Promise.all([solo ? Promise.resolve([]) : horariosAsistencia(conexion), jornadasAsistencia(conexion)])
  const jornadas = solo ? todasJornadas.filter((j) => j.documento === normalizarCedula(solo.numeroDocumento)) : todasJornadas
  if (solo && jornadas.length === 0) throw new ErrorNegocio('En AsistencIA no hay nadie registrado con esta cédula.')

  const r: ResumenImportacion = { plantillasNuevas: 0, plantillasActualizadas: 0, personasActualizadas: 0, personasIguales: 0, sinFicha: [], sinDias: [], ops: 0 }

  for (const p of plantillas) {
    const v = validarDias(p.dias)
    const nombre = String(p.nombre ?? '').trim()
    if ('error' in v || !nombre) continue
    const existente = await prisma.horario.findUnique({ where: { nombre } })
    if (!existente) {
      await dbAuditado.horario.create({ data: { nombre, dias: v.dias, descripcion: 'Traído de AsistencIA' } })
      r.plantillasNuevas++
    } else if (!mismosDias(existente.dias as DiasHorario, v.dias)) {
      await dbAuditado.horario.update({ where: { id: existente.id }, data: { dias: v.dias } })
      r.plantillasActualizadas++
    }
  }
  const todas = await prisma.horario.findMany({ where: { activo: true }, select: { id: true, dias: true } })

  const colaboradores = await prisma.colaborador.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, numeroDocumento: true, tipoVinculo: true },
  })
  const porCedula = new Map(colaboradores.map((c) => [normalizarCedula(c.numeroDocumento), c]))
  const hoy = hoyBogota()

  for (const j of jornadas) {
    const c = porCedula.get(j.documento)
    if (!c) { r.sinFicha.push(j.nombre ?? j.documento); continue }
    if ((VINCULOS_SIN_HORARIO as readonly string[]).includes(c.tipoVinculo)) { r.ops++; continue }
    const v = j.dias ? validarDias(j.dias) : null
    if (!v || 'error' in v) { r.sinDias.push(j.nombre ?? j.documento); continue }

    const vigente = await horarioDeHoy(c.id)
    if (vigente && mismosDias(vigente.dias as DiasHorario, v.dias)) { r.personasIguales++; continue }
    const plantilla = todas.find((t) => mismosDias(t.dias as DiasHorario, v.dias))
    const ultima = await prisma.asignacionHorario.findFirst({ where: { colaboradorId: c.id }, orderBy: { desde: 'desc' } })
    if (ultima && ultima.desde > hoy) continue // tiene un cambio programado aquí: manda el de aquí
    if (ultima && ultima.desde.getTime() === hoy.getTime()) {
      await dbAuditado.asignacionHorario.update({
        where: { id: ultima.id },
        data: { horarioId: plantilla?.id ?? null, dias: v.dias, origen: 'ASISTENCIA', sincronizadoEn: new Date(), errorSincronizacion: null, asignadoPorId: usuarioId },
      })
    } else {
      if (ultima) await dbAuditado.asignacionHorario.update({ where: { id: ultima.id }, data: { hasta: new Date(hoy.getTime() - unDia) } })
      await dbAuditado.asignacionHorario.create({
        data: {
          colaboradorId: c.id, horarioId: plantilla?.id ?? null, dias: v.dias, desde: hoy, origen: 'ASISTENCIA',
          motivo: 'Traído de AsistencIA', sincronizadoEn: new Date(), asignadoPorId: usuarioId,
        },
      })
    }
    r.personasActualizadas++
  }
  return r
}

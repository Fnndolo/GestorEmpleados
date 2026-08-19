'use server'

import { revalidatePath } from 'next/cache'
import { esOps } from '@/lib/tramites-vinculo'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import {
  incapacidadSchema, licenciaSchema, permisoSchema, vacacionesSchema, bonificacionSchema,
} from '@/lib/validaciones/novedades'
import { parseFechaISO, formatFechaISO, hoyBogota } from '@/lib/fechas'
import { esDiaHabil } from '@/lib/dias-habiles'
import { cargarFestivos } from '@/server/vencimientos/festivos'
import { DIAS_PREAVISO_EMPRESA, fechaMinimaPreaviso } from '@/server/vacaciones-reglas'
import { liquidarVacaciones, desgloseHtml } from '@/server/vacaciones-liquidacion'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { saldoVacaciones } from '@/server/vacaciones'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

function diasCalendario(ini: string, fin: string): number {
  const a = parseFechaISO(ini)!, b = parseFechaISO(fin)!
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Cuenta días hábiles en [ini, fin] inclusive. */
export async function diasHabilesRango(ini: string, fin: string): Promise<number> {
  const a = parseFechaISO(ini)!, b = parseFechaISO(fin)!
  const empresa = await prisma.configuracionEmpresa.findFirst()
  const festivos = await cargarFestivos(a.getUTCFullYear() - 1, b.getUTCFullYear() + 1)
  let n = 0
  const d = new Date(a)
  while (d <= b) {
    if (esDiaHabil(d, festivos, empresa?.sabadoHabil ?? true)) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

export const registrarIncapacidad = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: incapacidadSchema },
  async (d) => {
    if (parseFechaISO(d.fechaFin)! < parseFechaISO(d.fechaInicio)!) throw new ErrorNegocio('La fecha de fin no puede ser anterior al inicio.')
    await dbAuditado.incapacidad.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        dias: diasCalendario(d.fechaInicio, d.fechaFin),
        diagnosticoCie10: v(d.diagnosticoCie10), entidad: v(d.entidad),
        esProrroga: d.esProrroga, observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

export const registrarLicencia = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: licenciaSchema },
  async (d) => {
    await dbAuditado.licencia.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        dias: diasCalendario(d.fechaInicio, d.fechaFin),
        remunerada: d.remunerada, observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

/**
 * Impide registrarle a un contratista OPS una novedad que solo existe en la
 * relación laboral. Además de ser inaplicable, dejar el registro sería prueba
 * escrita de subordinación en un eventual proceso por contrato realidad.
 */
async function exigirVinculoLaboral(colaboradorId: string, novedad: 'vacaciones' | 'permiso'): Promise<void> {
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { tipoVinculo: true } })
  if (esOps(c?.tipoVinculo)) {
    throw new ErrorNegocio(
      `No se pueden registrar ${novedad === 'vacaciones' ? 'vacaciones' : 'permisos'} a un contratista de prestación de servicios: no hay relación laboral.`,
    )
  }
}

export const registrarPermiso = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: permisoSchema },
  async (d) => {
    await exigirVinculoLaboral(d.colaboradorId, 'permiso')
    await dbAuditado.permiso.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!,
        horas: d.diaCompleto ? null : d.horas ?? null, diaCompleto: d.diaCompleto,
        motivo: d.motivo, remunerado: d.remunerado,
      },
    })
    revalidatePath('/novedades')
  },
)

export const registrarVacaciones = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: vacacionesSchema },
  async (d) => {
    await exigirVinculoLaboral(d.colaboradorId, 'vacaciones')
    // Cuando la empresa fija la época de vacaciones debe notificar al trabajador con
    // al menos 15 días de anticipación (RIT art. 34, en concordancia con el art. 187 CST).
    const inicio = parseFechaISO(d.fechaInicio)!
    const minimo = await fechaMinimaPreaviso()
    if (inicio < minimo) {
      throw new ErrorNegocio(
        `La fecha de inicio debe ser al menos ${DIAS_PREAVISO_EMPRESA} días hábiles después de hoy: la empresa debe notificar las vacaciones con esa anticipación (RIT art. 34).`,
      )
    }
    const dias = await diasHabilesRango(d.fechaInicio, d.fechaFin)
    await dbAuditado.vacaciones.create({
      data: {
        colaboradorId: d.colaboradorId,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        diasHabiles: dias, estado: 'APROBADA', observaciones: v(d.observaciones),
      },
    })
    // Notificación oficial por escrito al trabajador (RIT art. 34) con el
    // desglose del pago (RIT art. 42), enviada al programarlas la empresa.
    const usuarioId = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioId) {
      const liq = await liquidarVacaciones(d.colaboradorId, dias)
      await avisar(usuarioId, {
        titulo: 'La empresa programó tus vacaciones',
        mensaje: liq
          ? desgloseHtml(liq, d.fechaInicio, d.fechaFin).replace('fueron aprobadas', 'fueron programadas por la empresa con el preaviso legal de 15 días (RIT art. 34)')
          : `La empresa programó tus vacaciones del ${d.fechaInicio} al ${d.fechaFin} (${dias} días hábiles), con el preaviso legal de 15 días (RIT art. 34).`,
        enlace: '/autoservicio', llamadoAccion: 'Ver mis vacaciones', evento: 'vacaciones_programadas',
      })
    }
    revalidatePath('/novedades')
    return { dias }
  },
)

/**
 * Vacaciones colectivas (Flujo 2B) — RIT art. 34: "La empresa establecerá la época
 * de vacaciones, ya sea de manera individual o colectiva… notificará al trabajador
 * la fecha de inicio con al menos quince (15) días de anticipación".
 * RRHH selecciona toda la empresa, una sede o un área; el sistema calcula por
 * persona si salen con días causados o anticipados (RIT art. 33), crea los
 * registros en lote (RIT art. 35) y dispara la notificación masiva con el
 * desglose del pago (RIT art. 42).
 */
export const registrarVacacionesColectivas = accion(
  {
    modulo: 'novedades',
    accion: 'CREAR',
    schema: z.object({
      alcance: z.enum(['EMPRESA', 'SEDE', 'AREA']),
      sedeId: z.uuid().optional(),
      areaId: z.uuid().optional(),
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      observaciones: z.string().max(500).optional(),
    }),
  },
  async (d) => {
    if (d.alcance === 'SEDE' && !d.sedeId) throw new ErrorNegocio('Selecciona la sede.')
    if (d.alcance === 'AREA' && !d.areaId) throw new ErrorNegocio('Selecciona el área.')
    const inicio = parseFechaISO(d.fechaInicio)!
    const fin = parseFechaISO(d.fechaFin)!
    if (fin < inicio) throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')

    // Preaviso legal (RIT art. 34), contado en días hábiles.
    const minimo = await fechaMinimaPreaviso()
    if (inicio < minimo) {
      throw new ErrorNegocio(
        `Las vacaciones colectivas deben notificarse con al menos ${DIAS_PREAVISO_EMPRESA} días hábiles de anticipación (RIT art. 34).`,
      )
    }

    const dias = await diasHabilesRango(d.fechaInicio, d.fechaFin)
    if (dias === 0) throw new ErrorNegocio('El rango elegido no contiene días hábiles.')

    const colaboradores = await prisma.colaborador.findMany({
      where: {
        estado: 'ACTIVO',
        // Los contratistas OPS no entran en la vacación colectiva: no tienen
        // vacaciones que disfrutar y programárselas sería tratarlos como empleados.
        tipoVinculo: { not: 'OPS' },
        ...(d.alcance === 'SEDE' ? { sedeId: d.sedeId } : {}),
        ...(d.alcance === 'AREA' ? { areaId: d.areaId } : {}),
      },
      select: { id: true, usuarioId: true },
    })
    if (colaboradores.length === 0) throw new ErrorNegocio('No hay colaboradores activos con vínculo laboral en el alcance elegido.')

    let creados = 0, anticipados = 0, omitidos = 0
    for (const c of colaboradores) {
      // Quien ya tiene vacaciones que se cruzan con el rango no se duplica.
      const cruce = await prisma.vacaciones.findFirst({
        where: {
          colaboradorId: c.id,
          estado: { in: ['SOLICITADA', 'APROBADA', 'EN_DISFRUTE'] },
          fechaInicio: { lte: fin }, fechaFin: { gte: inicio },
        },
      })
      if (cruce) { omitidos++; continue }

      // Causadas vs. anticipadas por persona (RIT art. 33).
      const { saldo } = await saldoVacaciones(c.id)
      const esAnticipada = dias > saldo
      if (esAnticipada) anticipados++

      await dbAuditado.vacaciones.create({
        data: {
          colaboradorId: c.id,
          fechaInicio: inicio, fechaFin: fin, diasHabiles: dias, estado: 'APROBADA',
          observaciones: [
            `Vacaciones colectivas fijadas por la empresa (RIT art. 34).`,
            esAnticipada ? `Salida anticipada: ${Math.round((dias - saldo) * 100) / 100} día(s) aún sin causar (RIT art. 33).` : null,
            v(d.observaciones),
          ].filter(Boolean).join(' '),
        },
      })
      creados++

      // Notificación oficial por escrito con el desglose del pago (RIT arts. 34 y 42).
      if (c.usuarioId) {
        const liq = await liquidarVacaciones(c.id, dias)
        await avisar(c.usuarioId, {
          titulo: 'Vacaciones colectivas programadas',
          mensaje: liq
            ? desgloseHtml(liq, d.fechaInicio, d.fechaFin).replace('fueron aprobadas', 'fueron fijadas como vacaciones colectivas por la empresa, con el preaviso legal de 15 días (RIT art. 34)')
            : `La empresa fijó vacaciones colectivas del ${d.fechaInicio} al ${d.fechaFin} (${dias} días hábiles), con el preaviso legal de 15 días (RIT art. 34).`,
          enlace: '/autoservicio', llamadoAccion: 'Ver mis vacaciones', evento: 'vacaciones_colectivas',
        })
      }
    }

    revalidatePath('/novedades')
    return { creados, anticipados, omitidos, dias }
  },
)

/**
 * Interrupción de vacaciones en curso — RIT art. 36: "Si durante el período de
 * vacaciones se presenta una interrupción justificada (por accidente, calamidad o
 * fuerza mayor), el trabajador conservará el derecho a reanudar los días restantes.
 * Este hecho deberá quedar debidamente registrado."
 * El registro original se recorta a los días efectivamente disfrutados; los días
 * restantes vuelven al saldo del colaborador (RIT arts. 33 y 35) para reanudarlos.
 */
export const interrumpirVacaciones = accion(
  {
    modulo: 'novedades',
    accion: 'EDITAR',
    schema: z.object({
      vacacionesId: z.uuid(),
      fechaInterrupcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      motivo: z.string().min(5).max(500),
    }),
  },
  async (d) => {
    const vac = await prisma.vacaciones.findUniqueOrThrow({
      where: { id: d.vacacionesId },
      include: { colaborador: { select: { usuarioId: true } } },
    })
    if (vac.estado !== 'EN_DISFRUTE' && vac.estado !== 'APROBADA') {
      throw new ErrorNegocio('Solo se pueden interrumpir vacaciones aprobadas o en disfrute.')
    }
    const corte = parseFechaISO(d.fechaInterrupcion)!
    if (corte < vac.fechaInicio || corte > vac.fechaFin) {
      throw new ErrorNegocio('La fecha de interrupción debe estar dentro del período de vacaciones.')
    }

    // Días efectivamente disfrutados: desde el inicio hasta el día ANTERIOR a la interrupción.
    const diaAntes = new Date(corte)
    diaAntes.setUTCDate(diaAntes.getUTCDate() - 1)
    const disfrutados = diaAntes < vac.fechaInicio
      ? 0
      : await diasHabilesRango(formatFechaISO(vac.fechaInicio)!, formatFechaISO(diaAntes)!)
    const restantes = Math.round((Number(vac.diasHabiles) - disfrutados) * 100) / 100

    const constancia = `Interrumpidas el ${d.fechaInterrupcion} (RIT art. 36): ${d.motivo}. Días disfrutados: ${disfrutados}; conserva ${restantes} día(s) hábiles para reanudar.`
    await dbAuditado.vacaciones.update({
      where: { id: vac.id },
      data: disfrutados === 0
        // No alcanzó a disfrutar nada: el registro se cancela y todo el derecho vuelve al saldo.
        ? { estado: 'CANCELADA', diasHabiles: 0, observaciones: [vac.observaciones, constancia].filter(Boolean).join(' ') }
        : {
            estado: 'DISFRUTADA', fechaFin: diaAntes, diasHabiles: disfrutados,
            observaciones: [vac.observaciones, constancia].filter(Boolean).join(' '),
          },
    })

    if (vac.colaborador.usuarioId) {
      await avisar(vac.colaborador.usuarioId, {
        titulo: 'Tus vacaciones fueron interrumpidas',
        mensaje: `Se registró la interrupción de tus vacaciones el ${d.fechaInterrupcion} por: ${d.motivo}. Conservas ${restantes} día(s) hábiles para reanudar cuando se acuerde la nueva fecha (RIT art. 36).`,
        enlace: '/autoservicio', llamadoAccion: 'Ver mis vacaciones', evento: 'vacaciones_interrumpidas',
      })
    }
    revalidatePath('/novedades')
    return { disfrutados, restantes }
  },
)

/**
 * Reanudación de vacaciones interrumpidas — RIT art. 36. No aplica el preaviso de
 * 15 días del art. 34 porque no es una nueva imposición de la empresa, sino la
 * continuación de un descanso ya concedido e interrumpido por causa justificada.
 */
export const reanudarVacaciones = accion(
  {
    modulo: 'novedades',
    accion: 'CREAR',
    schema: z.object({
      vacacionesId: z.uuid(), // registro interrumpido de origen
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async (d) => {
    const origen = await prisma.vacaciones.findUniqueOrThrow({
      where: { id: d.vacacionesId },
      include: { colaborador: { select: { usuarioId: true } } },
    })
    if (!origen.observaciones?.includes('RIT art. 36')) {
      throw new ErrorNegocio('Este registro no corresponde a unas vacaciones interrumpidas.')
    }
    if (parseFechaISO(d.fechaFin)! < parseFechaISO(d.fechaInicio)!) {
      throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')
    }
    const dias = await diasHabilesRango(d.fechaInicio, d.fechaFin)
    if (dias === 0) throw new ErrorNegocio('El rango elegido no contiene días hábiles.')
    const { saldo } = await saldoVacaciones(origen.colaboradorId)
    if (dias > saldo) {
      throw new ErrorNegocio(`La reanudación (${dias} días hábiles) supera el saldo disponible del colaborador (${saldo}).`)
    }

    await dbAuditado.vacaciones.create({
      data: {
        colaboradorId: origen.colaboradorId,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        diasHabiles: dias, estado: 'APROBADA',
        observaciones: `Reanudación de las vacaciones interrumpidas el ${formatFechaISO(origen.fechaFin)} (RIT art. 36).`,
      },
    })

    if (origen.colaborador.usuarioId) {
      const liq = await liquidarVacaciones(origen.colaboradorId, dias)
      await avisar(origen.colaborador.usuarioId, {
        titulo: 'Reanudación de tus vacaciones',
        mensaje: liq
          ? desgloseHtml(liq, d.fechaInicio, d.fechaFin).replace('fueron aprobadas', 'quedaron programadas como reanudación de tu descanso interrumpido (RIT art. 36)')
          : `Reanudarás tus vacaciones del ${d.fechaInicio} al ${d.fechaFin} (${dias} días hábiles) — RIT art. 36.`,
        enlace: '/autoservicio', llamadoAccion: 'Ver mis vacaciones', evento: 'vacaciones_reanudadas',
      })
    }
    revalidatePath('/novedades')
    return { dias }
  },
)

export const registrarBonificacion = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: bonificacionSchema },
  async (d) => {
    await dbAuditado.bonificacion.create({
      data: {
        colaboradorId: d.colaboradorId, concepto: d.concepto, valor: d.valor,
        constitutivoSalario: d.constitutivoSalario, estadoPago: 'PENDIENTE',
        observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

export const marcarBonificacionPagada = accion(
  { modulo: 'novedades', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.bonificacion.update({
      where: { id },
      data: { estadoPago: 'PAGADO', fechaPago: hoyBogota() },
    })
    revalidatePath('/novedades')
  },
)

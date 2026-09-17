'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import {
  CODIGOS_ASISTENCIA, ErrorAsistencia, normalizarCedula, rangoDePeriodo, resumenAsistencia,
} from '@/server/asistencia/cliente'
import { sincronizarHorasAsistencia } from '@/server/asistencia/horas-asistencia'
import { generarOrdenPagoHorasExtra, subirComprobantePagoHorasExtra, marcarPagoHorasExtraPendiente } from '@/server/pago-horas-extra'
import { parseFechaISO } from '@/lib/fechas'

/**
 * Lo que la pantalla de Horas extra le pide a AsistencIA: ver el período y
 * traerlo como novedades. La clave se conecta en Ajustes → Integraciones.
 */

const periodoSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Indica el mes como AAAA-MM.'),
  quincena: z.union([z.literal(1), z.literal(2)]).nullable(),
})

/** Una persona en la tabla de la pantalla: lo de AsistencIA cruzado con la ficha de aquí. */
export type FilaAsistencia = {
  documento: string
  nombre: string
  sede: string | null
  /** Ficha de esta plataforma; null si la cédula no existe aquí (o está retirada). */
  colaboradorId: string | null
  horas: Record<string, number>
  horasExtra: number
  /** Pesos según el salario que tiene en AsistencIA; null si allá no lo tiene. */
  valor: number | null
  pago: 'pagado' | 'pendiente' | 'parcial'
  /** Tramos del período y cuántos ya están registrados aquí como novedad. */
  tramos: number
  registrados: number
  /** Periodos de nómina de aquí que ya recogieron alguno de sus tramos. */
  periodos: string[]
  /**
   * Pago APARTE de la nómina (decisión de esta empresa): null si nunca se ha
   * generado la orden ni subido comprobante para este período. `pago` (arriba)
   * es el estado tal como lo ve AsistencIA por el cierre de nómina; esto es lo
   * que de verdad importa aquí, porque las horas extra no se pagan con la
   * nómina.
   */
  pagoLocal: { id: string; estado: 'PENDIENTE' | 'PAGADO'; ordenDocId: string | null; comprobanteDocId: string | null } | null
}

export type ResumenPantalla = {
  desde: string
  hasta: string
  totales: { horas: Record<string, number>; horasExtra: number; valor: number; sinSalario: number }
  filas: FilaAsistencia[]
  sinFicha: number
}

const traducir = (e: unknown): never => {
  if (e instanceof ErrorAsistencia) throw new ErrorNegocio(e.message)
  throw e
}

/** Las horas del período tal como las reporta AsistencIA, cruzadas con las fichas. */
export const consultarHorasAsistencia = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: periodoSchema },
  async (d): Promise<ResumenPantalla> => {
    const r = await resumenAsistencia({ mes: d.mes, quincena: d.quincena }).catch(traducir)
    const rango = rangoDePeriodo(d.mes, d.quincena)

    const fichas = await prisma.colaborador.findMany({ select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, estado: true } })
    const porCedula = new Map(fichas.map((c) => [normalizarCedula(c.numeroDocumento), c]))

    // Qué tramos ya están aquí y en qué periodo cayeron.
    const referencias = r.empleados.flatMap((e) => e.referencias)
    const existentes = referencias.length
      ? await prisma.novedadHoras.findMany({
          where: { referenciaExterna: { in: referencias } },
          select: { referenciaExterna: true, periodo: { select: { nombre: true } } },
        })
      : []
    const registrada = new Map<string, string | null>()
    for (const x of existentes) registrada.set(x.referenciaExterna!, x.periodo?.nombre ?? null)

    // Pago APARTE de nómina de este mismo período exacto (desde/hasta), por colaborador.
    const desde = parseFechaISO(rango.desde)!
    const hasta = parseFechaISO(rango.hasta)!
    const colaboradorIds = [...porCedula.values()].map((c) => c.id)
    const pagos = colaboradorIds.length
      ? await prisma.pagoHorasExtra.findMany({
          where: { colaboradorId: { in: colaboradorIds }, desde, hasta },
          select: { id: true, colaboradorId: true, estado: true, ordenDocId: true, comprobanteDocId: true },
        })
      : []
    const pagoPorColaborador = new Map(pagos.map((p) => [p.colaboradorId, p]))

    const filas: FilaAsistencia[] = r.empleados.map((e) => {
      const ficha = porCedula.get(normalizarCedula(e.documento))
      const activa = ficha && ficha.estado !== 'RETIRADO' ? ficha : null
      const periodos = [...new Set(e.referencias.map((ref) => registrada.get(ref)).filter((p): p is string => Boolean(p)))]
      return {
        documento: e.documento,
        nombre: activa ? `${activa.nombres} ${activa.apellidos}` : (e.nombre ?? e.documento),
        sede: e.sede,
        colaboradorId: activa?.id ?? null,
        horas: Object.fromEntries(CODIGOS_ASISTENCIA.map((c) => [c, e.horas[c] ?? 0])),
        horasExtra: e.horasExtra,
        valor: e.valor,
        pago: e.pago,
        tramos: e.referencias.length,
        registrados: e.referencias.filter((ref) => registrada.has(ref)).length,
        periodos,
        pagoLocal: activa ? (() => {
          const p = pagoPorColaborador.get(activa.id)
          return p ? { id: p.id, estado: p.estado, ordenDocId: p.ordenDocId, comprobanteDocId: p.comprobanteDocId } : null
        })() : null,
      }
    })

    return {
      desde: r.desde,
      hasta: r.hasta,
      totales: { horas: r.totales.horas, horasExtra: r.totales.horasExtra, valor: r.totales.valor, sinSalario: r.totales.sinSalario },
      filas,
      sinFicha: filas.filter((f) => !f.colaboradorId).length,
    }
  },
)

/**
 * Registra como novedades pendientes las horas del período que AsistencIA
 * reporta. Idempotente: lo ya registrado (o ya pagado) no se duplica.
 */
export const traerHorasAsistencia = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: periodoSchema },
  async (d) => {
    const rango = rangoDePeriodo(d.mes, d.quincena)
    const r = await sincronizarHorasAsistencia(rango).catch(traducir)
    await auditar('CREAR', 'NovedadHoras', {
      descripcion: `Horas de AsistencIA ${rango.desde} a ${rango.hasta}: ${r.creadas} nuevas, ${r.yaEstaban} ya registradas, ${r.quitadas} retiradas`,
    })
    revalidatePath('/nomina/novedades')
    return r
  },
)

const pagoSchema = periodoSchema.extend({ colaboradorId: z.uuid() })

/**
 * Arma (o rehace) la orden de pago de horas extra de una persona para el
 * período consultado. En esta empresa las horas extra se pagan APARTE de la
 * nómina: este PDF es el resumen que se envía a quien paga, no un desprendible.
 */
export const generarOrdenPago = accion(
  { modulo: 'nomina', accion: 'EDITAR', schema: pagoSchema },
  async (d, usuario) => {
    const r = await generarOrdenPagoHorasExtra({ colaboradorId: d.colaboradorId, mes: d.mes, quincena: d.quincena, usuarioId: usuario.id })
    await auditar('EDITAR', 'PagoHorasExtra', { registroId: r.pagoId, descripcion: `Orden de pago de horas extra generada (${d.mes}${d.quincena ? ` Q${d.quincena}` : ''})` })
    revalidatePath('/nomina/novedades')
    return r
  },
)

/** Sube el soporte de que el pago ya se hizo y marca la persona como pagada. */
export const subirComprobantePago = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: pagoSchema.extend({
      pdfBase64: z.string().min(1, 'Adjunta el comprobante'),
      nombreArchivo: z.string().trim().max(200).optional().or(z.literal('')),
    }),
  },
  async (d, usuario) => {
    const r = await subirComprobantePagoHorasExtra({
      colaboradorId: d.colaboradorId, mes: d.mes, quincena: d.quincena,
      pdfBase64: d.pdfBase64, nombreArchivo: d.nombreArchivo, usuarioId: usuario.id,
    })
    await auditar('EDITAR', 'PagoHorasExtra', { registroId: r.pagoId, descripcion: `Marcado como pagado (${d.mes}${d.quincena ? ` Q${d.quincena}` : ''})` })
    revalidatePath('/nomina/novedades')
    return r
  },
)

/** Corrige un comprobante subido por error: vuelve el pago a pendiente y lo retira. */
export const marcarPagoPendiente = accion(
  { modulo: 'nomina', accion: 'EDITAR', schema: pagoSchema },
  async (d) => {
    await marcarPagoHorasExtraPendiente({ colaboradorId: d.colaboradorId, mes: d.mes, quincena: d.quincena })
    await auditar('EDITAR', 'PagoHorasExtra', { descripcion: `Pago de horas extra vuelto a pendiente (${d.mes}${d.quincena ? ` Q${d.quincena}` : ''})` })
    revalidatePath('/nomina/novedades')
  },
)

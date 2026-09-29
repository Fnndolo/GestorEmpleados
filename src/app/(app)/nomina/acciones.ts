'use server'

import { revalidatePath } from 'next/cache'
import { anotarPagoPeriodoEnAsistencia } from '@/server/asistencia/pagos-asistencia'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { liquidarPeriodo, revertirEfectosPeriodo } from '@/server/nomina/liquidador'
import { generarDesprendibles } from '@/server/nomina/desprendibles'
import { generarPazSalvoPrestamo } from '@/server/prestamos'
import { parseFechaISO } from '@/lib/fechas'
import { registrarPagoCuentaCobro } from '@/server/cuentas-cobro'
import { registrarPagoNomina } from '@/server/nomina/pagos'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { fmtCOP } from '@/lib/moneda'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA } from '@/server/nomina/horas'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const crearPeriodo = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      anio: z.coerce.number().int().min(2024).max(2100),
      mes: z.coerce.number().int().min(1).max(12),
      tipo: z.enum(['MENSUAL', 'QUINCENAL']),
      quincena: z.coerce.number().int().min(1).max(2).optional(),
    }),
  },
  async (d) => {
    const existe = await prisma.periodoNomina.findFirst({
      where: { anio: d.anio, mes: d.mes, quincena: d.tipo === 'QUINCENAL' ? (d.quincena ?? 1) : null, esAjuste: false },
    })
    if (existe) throw new ErrorNegocio('Ya existe ese periodo de nómina.')

    const diasPeriodo = d.tipo === 'QUINCENAL' ? 15 : 30
    const inicioDia = d.tipo === 'QUINCENAL' && d.quincena === 2 ? 16 : 1
    const finDia = d.tipo === 'QUINCENAL' ? (d.quincena === 2 ? 30 : 15) : 30
    const nombre = `${MESES[d.mes - 1]} ${d.anio}${d.tipo === 'QUINCENAL' ? ` · ${d.quincena}ª quincena` : ''}`

    const periodo = await dbAuditado.periodoNomina.create({
      data: {
        nombre, tipo: d.tipo, anio: d.anio, mes: d.mes,
        quincena: d.tipo === 'QUINCENAL' ? (d.quincena ?? 1) : null,
        fechaInicio: new Date(Date.UTC(d.anio, d.mes - 1, inicioDia)),
        fechaFin: new Date(Date.UTC(d.anio, d.mes - 1, finDia)),
        diasPeriodo, estado: 'BORRADOR',
      },
    })
    revalidatePath('/nomina')
    return { id: periodo.id }
  },
)

export const liquidar = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const r = await liquidarPeriodo(periodoId)
    revalidatePath(`/nomina/${periodoId}`)
    return r
  },
)

export const aprobarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado !== 'CALCULADA') throw new ErrorNegocio('Solo se aprueban periodos calculados.')
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'APROBADA' } })
    revalidatePath(`/nomina/${periodoId}`)
  },
)

export const cerrarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado !== 'APROBADA') throw new ErrorNegocio('Solo se cierran periodos aprobados.')
    // Los efectos (abono de préstamos, bonificaciones pagadas, vacaciones anticipadas) los
    // aplica el LIQUIDADOR, de forma idempotente y atada al periodo. Cerrar solo congela el
    // estado: no debe volver a aplicarlos o se descontarían/pagarían dos veces.
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'CERRADA' } })
    // Las horas de asistencia que este periodo pagó quedan anotadas allá.
    const asistencia = await anotarPagoPeriodoEnAsistencia(periodoId, true)
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${periodoId}`)
    return { asistencia }
  },
)

/**
 * Reabre un periodo cerrado o aprobado para poder corregirlo. Devuelve el periodo a
 * BORRADOR y deshace todo lo que había dejado aplicado (abonos de préstamo,
 * bonificaciones pagadas, vacaciones anticipadas), de modo que al volver a liquidar
 * no queden dobles descuentos. No se puede reabrir un periodo ya PAGADO.
 */
export const reabrirPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado === 'PAGADA') throw new ErrorNegocio('El periodo ya fue pagado: corrige con un periodo de ajuste.')
    if (p.estado === 'BORRADOR') throw new ErrorNegocio('El periodo ya está abierto.')
    // Con pagos registrados ya no se reabre: recalcular borraría lo que se pagó.
    const pagados = await prisma.liquidacionNomina.count({ where: { periodoId, pagadoEn: { not: null } } })
    if (pagados > 0) throw new ErrorNegocio(`Ya hay ${pagados} pago(s) registrado(s) en este periodo: no se puede reabrir. Corrige con un periodo de ajuste.`)

    await revertirEfectosPeriodo(periodoId)
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'BORRADOR' } })
    // Si estaba cerrado, sus horas de asistencia ya no cuentan como pagadas.
    const asistencia = p.estado === 'CERRADA' ? await anotarPagoPeriodoEnAsistencia(periodoId, false) : undefined
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${periodoId}`)
    return { estadoAnterior: p.estado, asistencia }
  },
)

/**
 * Elimina un periodo que aún no se ha cerrado (útil si se creó por error). Deshace sus
 * efectos antes de borrarlo para no dejar préstamos ni bonificaciones descuadrados.
 */
export const eliminarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado === 'CERRADA' || p.estado === 'PAGADA') {
      throw new ErrorNegocio('No se puede eliminar un periodo cerrado o pagado. Reábrelo primero si necesitas corregirlo.')
    }

    // Las novedades que este periodo había recogido quedan sueltas, no se borran:
    // de eso ya se encarga revertirEfectosPeriodo. La comisión existió aunque el
    // periodo se elimine, y la recoge el siguiente que cubra su fecha.
    const sueltas = await prisma.comision.count({ where: { periodoId } })
      + await prisma.novedadHoras.count({ where: { periodoId } })
      + await prisma.novedadConcepto.count({ where: { periodoId } })
    await revertirEfectosPeriodo(periodoId)
    await dbAuditado.periodoNomina.delete({ where: { id: periodoId } })
    revalidatePath('/nomina')
    revalidatePath('/nomina/novedades')
    return { nombre: p.nombre, sueltas }
  },
)

export const generarPdfDesprendibles = accion(
  { modulo: 'nomina', accion: 'EXPORTAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }, usuario) => {
    const r = await generarDesprendibles(periodoId, usuario.id)
    revalidatePath(`/nomina/${periodoId}`)
    return r
  },
)

export const registrarPrestamo = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      valorTotal: z.coerce.number().min(1),
      numeroCuotas: z.coerce.number().int().min(1).max(60),
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      descripcion: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    // Un préstamo se recupera descontándolo de la nómina: exige colaborador
    // activo con contrato laboral vigente. A un retirado no se le presta
    // (no habría de dónde descontar; su saldo pendiente va a la liquidación).
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { estado: true } })
    if (colab.estado !== 'ACTIVO') throw new ErrorNegocio('El colaborador no está activo; no se le pueden registrar préstamos.')
    const contratoActivo = await prisma.contrato.count({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' } })
    if (contratoActivo === 0) throw new ErrorNegocio('El colaborador no tiene contrato laboral activo; el préstamo no tendría de dónde descontarse en nómina.')

    const valorCuota = Math.round(d.valorTotal / d.numeroCuotas)
    const prestamo = await dbAuditado.prestamo.create({
      data: {
        colaboradorId: d.colaboradorId, valorTotal: d.valorTotal, numeroCuotas: d.numeroCuotas,
        valorCuota, saldo: d.valorTotal, fechaInicio: parseFechaISO(d.fechaInicio)!,
        estado: 'ACTIVO', descripcion: d.descripcion,
      },
    })
    await prisma.cuotaPrestamo.createMany({
      data: Array.from({ length: d.numeroCuotas }, (_, i) => ({ prestamoId: prestamo.id, numero: i + 1, valor: valorCuota })),
    })
    revalidatePath('/nomina/prestamos')
    return { id: prestamo.id }
  },
)

export const generarPazSalvoDePrestamo = accion(
  { modulo: 'nomina', accion: 'EXPORTAR', schema: z.object({ prestamoId: z.uuid() }) },
  async ({ prestamoId }, usuario) => {
    const documentoId = await generarPazSalvoPrestamo(prestamoId, usuario.id)
    revalidatePath(`/nomina/prestamos/${prestamoId}`)
    return { documentoId }
  },
)

/**
 * Registra una comisión con su fecha de causación, sin amarrarla a un periodo.
 *
 * El periodo la recoge después por rango de fechas. Así se puede registrar el
 * día que ocurre —sin esperar a que alguien abra la nómina del mes— y lo que
 * quede sin pagar cuando alguien se retira lo recoge su liquidación.
 */
export const registrarComision = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipo: z.enum(['VENTA', 'RECAUDO']),
      baseCalculo: z.coerce.number().min(0),
      valor: z.coerce.number().min(0),
      descripcion: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.comision.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, tipo: d.tipo,
        baseCalculo: d.baseCalculo, valor: d.valor, descripcion: d.descripcion,
      },
    })
    revalidatePath('/nomina/novedades')
  },
)

/** Solo se puede borrar mientras nadie la haya pagado. */
export const eliminarComision = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const c = await prisma.comision.findUniqueOrThrow({ where: { id }, include: { periodo: true } })
    if (c.periodo && (c.periodo.estado === 'CERRADA' || c.periodo.estado === 'PAGADA')) {
      throw new ErrorNegocio('Ya se pagó en un periodo cerrado. Corrígelo con un periodo de ajuste.')
    }
    await dbAuditado.comision.delete({ where: { id } })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

/**
 * Aplica un concepto configurable del catálogo a un colaborador en un periodo
 * (auxilio, prima extralegal, descuento…). El motor lo liquida según las
 * banderas del concepto: constitutivo → IBC y prestaciones (art. 127/128 CST).
 */
export const registrarNovedadConcepto = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      conceptoId: z.uuid(),
      valor: z.coerce.number().min(0).optional(),
      observaciones: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    const concepto = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id: d.conceptoId } })
    if (!concepto.activo) throw new ErrorNegocio('El concepto está inactivo.')
    if (concepto.tipoCalculo === 'SISTEMA') throw new ErrorNegocio('Este concepto lo calcula el motor automáticamente; no se aplica a mano.')
    const valor = d.valor ?? Number(concepto.valorFijo ?? 0)
    if (valor <= 0) throw new ErrorNegocio('Indica el valor (el concepto no tiene valor fijo configurado).')

    await dbAuditado.novedadConcepto.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, conceptoId: d.conceptoId,
        valor, observaciones: d.observaciones || null,
      },
    })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

export const eliminarNovedadConcepto = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const n = await prisma.novedadConcepto.findUniqueOrThrow({ where: { id }, include: { periodo: true } })
    if (n.periodo && (n.periodo.estado === 'CERRADA' || n.periodo.estado === 'PAGADA')) {
      throw new ErrorNegocio('Ya se pagó en un periodo cerrado. Corrígelo con un periodo de ajuste.')
    }
    await dbAuditado.novedadConcepto.delete({ where: { id } })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

export const registrarHoras = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipoHora: z.enum(['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND']),
      horas: z.coerce.number().min(0.5).max(12),
      horaInicio: z.string().default(''),
      horaFin: z.string().default(''),
    }),
  },
  async (d) => {
    // Con rango horario, el sistema clasifica solo: la franja nocturna va de
    // 7:00 p.m. a 6:00 a.m. (Ley 2466, RIT art. 22). Un rango que cruza las
    // 7:00 p.m. se parte en dos novedades (parte diurna y parte nocturna).
    const rangoValido = /^\d{2}:\d{2}$/.test(d.horaInicio) && /^\d{2}:\d{2}$/.test(d.horaFin) && d.horaInicio !== d.horaFin
    if (rangoValido) {
      const { diurnas, nocturnas } = dividirDiurnoNocturno(d.horaInicio, d.horaFin)
      const pareja = PAREJA_TIPO_HORA[d.tipoHora]
      const tramos = [
        ...(diurnas > 0 && pareja.diurno ? [{ tipoHora: pareja.diurno, horas: diurnas }] : []),
        ...(nocturnas > 0 ? [{ tipoHora: pareja.nocturno, horas: nocturnas }] : []),
      ]
      if (tramos.length === 0) throw new ErrorNegocio('El rango indicado no genera horas con recargo (la hora ordinaria diurna no tiene recargo).')
      for (const t of tramos) {
        await dbAuditado.novedadHoras.create({
          data: {
            colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!,
            tipoHora: t.tipoHora, horas: t.horas, horaInicio: d.horaInicio, horaFin: d.horaFin,
            observaciones: tramos.length > 1 ? 'Clasificada automáticamente por franja horaria (Ley 2466).' : null,
          },
        })
      }
      revalidatePath('/nomina/novedades')
      return { tramos }
    }
    await dbAuditado.novedadHoras.create({
      data: { colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, tipoHora: d.tipoHora, horas: d.horas, horaInicio: d.horaInicio || '00:00', horaFin: d.horaFin || '00:00' },
    })
    revalidatePath('/nomina/novedades')
    return { tramos: [{ tipoHora: d.tipoHora, horas: d.horas }] }
  },
)

/**
 * Pagos OPS: registra el pago de una cuenta de cobro aprobada con su
 * comprobante, desde la misma lista de lo que falta por pagar. Le avisa al
 * contratista y la cuenta pasa a «Pagadas».
 */
export const pagarCuentaCobro = accion(
  {
    modulo: 'nomina',
    accion: 'APROBAR',
    schema: z.object({
      id: z.uuid(),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha del pago.'),
      comprobante: z.string().startsWith('data:', 'Adjunta el comprobante del pago.'),
    }),
  },
  async (d, usuario) => {
    const fechaPago = parseFechaISO(d.fechaPago)!
    const r = await registrarPagoCuentaCobro({ cuentaId: d.id, fechaPago, comprobanteDataUri: d.comprobante, usuarioId: usuario.id })
    const uid = r.colaboradorId ? await usuarioDeColaborador(r.colaboradorId) : null
    if (uid) {
      await avisar(uid, {
        evento: 'cuenta_cobro_estado',
        titulo: `Tu cuenta ${r.numero} fue pagada`,
        mensaje: `${fmtCOP(r.valor)} · pago del ${fechaBreve(d.fechaPago)}.`,
        enlace: '/autoservicio/cuentas-cobro',
        llamadoAccion: 'Ver mis cuentas de cobro',
      }).catch(() => {})
    }
    revalidatePath('/nomina/ops')
    revalidatePath('/contratos/cuentas-cobro')
    revalidatePath('/contratos/ops')
  },
)

/**
 * Registra el pago de la nómina de una persona en un periodo cerrado, con el
 * comprobante de su transferencia. Le avisa, y el periodo pasa a Pagada cuando
 * ya están pagados todos.
 */
export const pagarNominaPersona = accion(
  {
    modulo: 'nomina',
    accion: 'APROBAR',
    schema: z.object({
      liquidacionId: z.uuid(),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha del pago.'),
      comprobante: z.string().startsWith('data:', 'Adjunta el comprobante del pago.'),
    }),
  },
  async (d, usuario) => {
    const r = await registrarPagoNomina({ liquidacionId: d.liquidacionId, fechaPago: parseFechaISO(d.fechaPago)!, comprobanteDataUri: d.comprobante, usuarioId: usuario.id })
    const uid = await usuarioDeColaborador(r.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'nomina_pagada',
        titulo: `Se pagó tu nómina de ${r.periodoNombre}`,
        mensaje: `${fmtCOP(r.neto)} · pago del ${fechaBreve(d.fechaPago)}. El desprendible y el comprobante están en Mis desprendibles.`,
        enlace: '/autoservicio/desprendibles',
        llamadoAccion: 'Ver mis desprendibles',
      }).catch(() => {})
    }
    revalidatePath('/nomina')
    return { periodoPagado: r.periodoPagado }
  },
)

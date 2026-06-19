'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { liquidarPeriodo } from '@/server/nomina/liquidador'
import { generarDesprendibles } from '@/server/nomina/desprendibles'
import { generarPazSalvoPrestamo } from '@/server/prestamos'
import { parseFechaISO } from '@/lib/fechas'

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
    // Descontar cuotas de préstamo y marcar bonificaciones como pagadas
    await aplicarEfectosCierre(periodoId)
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'CERRADA' } })
    revalidatePath(`/nomina/${periodoId}`)
  },
)

async function aplicarEfectosCierre(periodoId: string) {
  const liquidaciones = await prisma.liquidacionNomina.findMany({
    where: { periodoId },
    include: { detalles: true },
  })
  for (const liq of liquidaciones) {
    // Préstamo: registrar cuota pagada y reducir saldo
    const tieneCuota = liq.detalles.find((d) => d.conceptoCodigo === 'PRESTAMO')
    if (tieneCuota) {
      const prestamo = await prisma.prestamo.findFirst({ where: { colaboradorId: liq.colaboradorId, estado: 'ACTIVO' } })
      if (prestamo) {
        const nuevoSaldo = Number(prestamo.saldo) - Number(tieneCuota.valor)
        await prisma.prestamo.update({
          where: { id: prestamo.id },
          data: { saldo: Math.max(0, nuevoSaldo), estado: nuevoSaldo <= 0 ? 'PAGADO' : 'ACTIVO' },
        })
        // Marcar la siguiente cuota pendiente como pagada en este periodo
        const cuota = await prisma.cuotaPrestamo.findFirst({ where: { prestamoId: prestamo.id, pagada: false }, orderBy: { numero: 'asc' } })
        if (cuota) await prisma.cuotaPrestamo.update({ where: { id: cuota.id }, data: { pagada: true, periodoId, fechaPago: new Date() } })
      }
    }
    // Bonificaciones pendientes → pagadas
    await prisma.bonificacion.updateMany({
      where: { colaboradorId: liq.colaboradorId, estadoPago: 'PENDIENTE' },
      data: { estadoPago: 'PAGADO', fechaPago: new Date() },
    })
  }
}

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

export const registrarComision = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      periodoId: z.uuid(),
      tipo: z.enum(['VENTA', 'RECAUDO']),
      baseCalculo: z.coerce.number().min(0),
      valor: z.coerce.number().min(0),
      descripcion: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.comision.create({
      data: { colaboradorId: d.colaboradorId, periodoId: d.periodoId, tipo: d.tipo, baseCalculo: d.baseCalculo, valor: d.valor, descripcion: d.descripcion },
    })
    revalidatePath(`/nomina/${d.periodoId}`)
  },
)

export const registrarHoras = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      periodoId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipoHora: z.enum(['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND']),
      horas: z.coerce.number().min(0.5).max(12),
      horaInicio: z.string().default(''),
      horaFin: z.string().default(''),
    }),
  },
  async (d) => {
    await dbAuditado.novedadHoras.create({
      data: { colaboradorId: d.colaboradorId, periodoId: d.periodoId, fecha: parseFechaISO(d.fecha)!, tipoHora: d.tipoHora, horas: d.horas, horaInicio: d.horaInicio || '00:00', horaFin: d.horaFin || '00:00' },
    })
    revalidatePath(`/nomina/${d.periodoId}`)
  },
)

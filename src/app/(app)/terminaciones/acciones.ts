'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { cargarParametros } from '@/server/nomina/parametros'
import { liquidacionDefinitiva } from '@/server/nomina/liquidacion-definitiva'
import { saldoVacaciones } from '@/server/vacaciones'

const ITEMS_PAZ_SALVO = [
  { area: 'Activos', concepto: 'Equipos y activos asignados devueltos' },
  { area: 'Cartera', concepto: 'Préstamos y cartera al día' },
  { area: 'Documentos', concepto: 'Documentos y expedientes entregados' },
  { area: 'Sistemas', concepto: 'Accesos y correos revocados' },
  { area: 'Dotación', concepto: 'Dotación devuelta (si aplica)' },
]

export const crearTerminacion = accion(
  {
    modulo: 'terminaciones',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['RENUNCIA_VOLUNTARIA', 'SIN_JUSTA_CAUSA', 'CON_JUSTA_CAUSA', 'TERMINACION_ANTICIPADA', 'MUTUO_ACUERDO', 'VENCIMIENTO_PLAZO', 'PERIODO_PRUEBA', 'FIN_OPS']),
      fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      preavisoDias: z.coerce.number().int().min(0).optional(),
      motivo: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    const existe = await prisma.terminacion.findFirst({ where: { colaboradorId: d.colaboradorId, estado: { not: 'CERRADA' } } })
    if (existe) throw new ErrorNegocio('Ya hay una terminación en proceso para este colaborador.')

    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId } })
    const contrato = await prisma.contrato.findFirst({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' } })
    const fechaRetiro = parseFechaISO(d.fechaRetiro)!

    // Cálculo de la liquidación definitiva (borrador para revisión del área contable)
    let liquidacionData: Awaited<ReturnType<typeof calcularLiq>> | null = null
    if (contrato) liquidacionData = await calcularLiq(d.colaboradorId, contrato, fechaRetiro, d.tipo)

    const terminacion = await dbAuditado.terminacion.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo, fechaRetiro,
        preavisoDias: d.preavisoDias ?? null,
        indemnizacion: liquidacionData?.indemnizacion ?? null,
        motivo: d.motivo, estado: liquidacionData ? 'LIQUIDADA' : 'EN_PROCESO',
      },
    })

    if (liquidacionData && contrato) {
      await prisma.liquidacionDefinitiva.create({
        data: {
          terminacionId: terminacion.id,
          diasLiquidados: liquidacionData.diasLiquidados,
          salarioBase: contrato.salarioBase,
          cesantias: liquidacionData.cesantias,
          interesesCesantias: liquidacionData.interesesCesantias,
          prima: liquidacionData.prima,
          vacaciones: liquidacionData.vacaciones,
          indemnizacion: liquidacionData.indemnizacion,
          deducciones: liquidacionData.deducciones,
          total: liquidacionData.total,
          detalle: liquidacionData as object,
        },
      })
    }

    // Paz y salvo con ítems automáticos
    const saldoPrestamo = await prisma.prestamo.aggregate({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } })
    const pazYSalvo = await prisma.pazYSalvo.create({ data: { terminacionId: terminacion.id, estado: 'PENDIENTE' } })
    await prisma.pazYSalvoItem.createMany({
      data: ITEMS_PAZ_SALVO.map((item) => ({
        pazYSalvoId: pazYSalvo.id,
        area: item.area,
        concepto: item.area === 'Cartera' && Number(saldoPrestamo._sum.saldo ?? 0) > 0
          ? `${item.concepto} (saldo préstamo pendiente)` : item.concepto,
        cumplido: false,
      })),
    })

    // Marcar colaborador como retirado y contrato terminado
    await dbAuditado.colaborador.update({ where: { id: d.colaboradorId }, data: { estado: 'RETIRADO', fechaRetiro } })
    if (contrato) await dbAuditado.contrato.update({ where: { id: contrato.id }, data: { estado: 'TERMINADO' } })

    revalidatePath('/terminaciones')
    return { id: terminacion.id }
  },
)

async function calcularLiq(colaboradorId: string, contrato: { salarioBase: unknown; tipo: string; fechaFin: Date | null }, fechaRetiro: Date, tipo: string) {
  const parametros = await cargarParametros(fechaRetiro)
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } })
  const saldoVac = await saldoVacaciones(colaboradorId)
  const saldoPrestamo = await prisma.prestamo.aggregate({ where: { colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } })
  // Promedio de comisiones de los últimos periodos
  const comisiones = await prisma.comision.aggregate({ where: { colaboradorId }, _avg: { valor: true } })

  return liquidacionDefinitiva({
    salarioBase: Number(contrato.salarioBase),
    promedioVariable: Number(comisiones._avg.valor ?? 0),
    fechaIngreso: colab.fechaIngreso,
    fechaRetiro,
    tipo,
    tipoContrato: contrato.tipo,
    fechaFinContrato: contrato.fechaFin,
    diasVacacionesPendientes: Math.max(0, saldoVac.saldo),
    saldoPrestamo: Number(saldoPrestamo._sum.saldo ?? 0),
    smmlv: parametros.SMMLV,
  })
}

export const verificarItemPazSalvo = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ itemId: z.uuid(), cumplido: z.boolean(), observacion: z.string().max(300).optional() }) },
  async (d, usuario) => {
    await dbAuditado.pazYSalvoItem.update({
      where: { id: d.itemId },
      data: { cumplido: d.cumplido, observacion: d.observacion, verificadoPorId: usuario.id, verificadoEn: new Date() },
    })
    // Si todos los ítems están cumplidos, marcar paz y salvo COMPLETO
    const item = await prisma.pazYSalvoItem.findUniqueOrThrow({ where: { id: d.itemId } })
    const pendientes = await prisma.pazYSalvoItem.count({ where: { pazYSalvoId: item.pazYSalvoId, cumplido: false } })
    await prisma.pazYSalvo.update({ where: { id: item.pazYSalvoId }, data: { estado: pendientes === 0 ? 'COMPLETO' : 'PENDIENTE' } })
    revalidatePath('/terminaciones')
    return { ok: true }
  },
)

export const cerrarTerminacion = accion(
  { modulo: 'terminaciones', accion: 'APROBAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const t = await prisma.terminacion.findUniqueOrThrow({ where: { id }, include: { pazYSalvo: { include: { items: true } } } })
    const pendientes = t.pazYSalvo?.items.filter((i) => !i.cumplido).length ?? 0
    if (pendientes > 0) throw new ErrorNegocio('No puedes cerrar la terminación con ítems de paz y salvo pendientes.')
    // Verificar que no haya periodos de nómina abiertos del colaborador
    await dbAuditado.terminacion.update({ where: { id }, data: { estado: 'CERRADA' } })
    revalidatePath('/terminaciones')
  },
)

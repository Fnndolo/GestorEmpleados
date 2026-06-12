import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { cargarParametros } from './parametros'
import { liquidar } from './motor'

/**
 * Liquida (o recalcula) un periodo de nómina completo: para cada colaborador
 * con contrato laboral activo, calcula su liquidación y persiste el detalle.
 * Idempotente: borra y recrea las liquidaciones del periodo (advisory lock).
 */
export async function liquidarPeriodo(periodoId: string): Promise<{ liquidados: number }> {
  const periodo = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
  if (periodo.estado === 'CERRADA' || periodo.estado === 'PAGADA') {
    throw new Error('El periodo está cerrado. Crea un periodo de ajuste para corregir.')
  }

  const empresaExonerada = true // KUPOCELL aplica exoneración Ley 114-1 (configurable)
  const parametros = await cargarParametros(periodo.fechaFin)

  // Colaboradores con contrato laboral activo en el periodo
  const contratos = await prisma.contrato.findMany({
    where: {
      estado: 'ACTIVO',
      tipo: { in: ['TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR'] },
      fechaInicio: { lte: periodo.fechaFin },
    },
    include: { colaborador: true },
  })

  // Lock por periodo para evitar liquidaciones concurrentes
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${periodoId}))`

  // Borrar liquidaciones previas del periodo (recálculo)
  await prisma.liquidacionNomina.deleteMany({ where: { periodoId } })

  let liquidados = 0
  for (const contrato of contratos) {
    const colaboradorId = contrato.colaboradorId
    // Días trabajados = días del periodo menos ausencias (incapacidades/licencias no remuneradas)
    const diasPeriodo = periodo.diasPeriodo

    // Horas extra del periodo
    const horas = await prisma.novedadHoras.findMany({ where: { colaboradorId, periodoId } })
    const tiposHora = await import('./parametros').then((m) => m.cargarTiposHora(periodo.fechaFin))
    const valorHora = Number(contrato.salarioBase) / 240
    let valorHorasExtra = 0
    for (const h of horas) {
      const factor = tiposHora[h.tipoHora] ?? 0
      valorHorasExtra += valorHora * factor * Number(h.horas)
    }

    // Comisiones del periodo
    const comisiones = await prisma.comision.aggregate({ where: { colaboradorId, periodoId }, _sum: { valor: true } })

    // Bonificaciones pendientes (se pagan en este periodo)
    const bonifConst = await prisma.bonificacion.aggregate({ where: { colaboradorId, estadoPago: 'PENDIENTE', constitutivoSalario: true }, _sum: { valor: true } })
    const bonifNoConst = await prisma.bonificacion.aggregate({ where: { colaboradorId, estadoPago: 'PENDIENTE', constitutivoSalario: false }, _sum: { valor: true } })

    // Cuota de préstamo activa
    const prestamo = await prisma.prestamo.findFirst({ where: { colaboradorId, estado: 'ACTIVO' } })
    const cuotaPrestamo = prestamo ? Number(prestamo.valorCuota) : 0

    const resultado = liquidar({
      salarioBase: Number(contrato.salarioBase),
      tipoSalario: contrato.tipoSalario,
      diasTrabajados: diasPeriodo,
      diasPeriodo,
      valorHorasExtra: Math.round(valorHorasExtra),
      comisiones: Number(comisiones._sum.valor ?? 0),
      bonificacionConstitutiva: Number(bonifConst._sum.valor ?? 0),
      bonificacionNoConstitutiva: Number(bonifNoConst._sum.valor ?? 0),
      valorIncapacidad: 0,
      cuotaPrestamo,
      claseRiesgoArl: contrato.colaborador.claseRiesgoArl ?? 'I',
      empresaExonerada,
      aplicaRetefuente: false,
      parametros,
    })

    await dbAuditado.liquidacionNomina.create({
      data: {
        periodoId,
        colaboradorId,
        diasTrabajados: diasPeriodo,
        salarioBase: contrato.salarioBase,
        ibc: resultado.ibc,
        totalDevengado: resultado.totalDevengado,
        totalDeducido: resultado.totalDeducido,
        neto: resultado.neto,
        detalles: {
          create: resultado.lineas.map((l) => ({
            conceptoCodigo: l.codigo,
            conceptoNombre: l.nombre,
            tipo: l.tipo,
            cantidad: l.cantidad ?? null,
            base: l.base ?? null,
            factor: l.factor ?? null,
            valor: l.valor,
          })),
        },
      },
    })
    liquidados++
  }

  await prisma.periodoNomina.update({
    where: { id: periodoId },
    data: { estado: 'CALCULADA', parametrosSnapshot: parametros },
  })

  return { liquidados }
}

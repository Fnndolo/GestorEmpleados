import { beforeEach, describe, expect, it, vi } from 'vitest'

const consultas = vi.hoisted(() => ({
  nominas: vi.fn(), conceptos: vi.fn(), comisiones: vi.fn(), bonos: vi.fn(), horas: vi.fn(), novedades: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ prisma: {
  liquidacionNomina: { findMany: consultas.nominas }, conceptoNomina: { findMany: consultas.conceptos },
  comision: { aggregate: consultas.comisiones }, bonificacion: { aggregate: consultas.bonos },
  novedadHoras: { findMany: consultas.horas }, novedadConcepto: { findMany: consultas.novedades },
} }))
vi.mock('@/server/accion', () => ({ ErrorNegocio: class ErrorNegocio extends Error {} }))

import { basesDesdeHistorial, ErrorBasesLiquidacion, mesesParaPromedios } from './bases-liquidacion'
import { liquidacionDefinitiva } from './liquidacion-definitiva'

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const ingreso = D(2026, 1, 15)
const retiro = D(2026, 7, 31)
const nomina = {
  id: 'junio', salarioBase: 3_000_000, diasTrabajados: 30,
  periodo: { nombre: 'Junio 2026', fechaInicio: D(2026, 6, 1), fechaFin: D(2026, 6, 30), esAjuste: false, parametrosSnapshot: { AUX_TRANSPORTE: 249_095 } },
  detalles: [{ conceptoCodigo: 'AUX_TRANSPORTE', tipo: 'DEVENGADO', valor: 249_095, base: null }],
}

beforeEach(() => {
  vi.clearAllMocks()
  consultas.nominas.mockResolvedValue([])
  consultas.conceptos.mockResolvedValue([])
  consultas.comisiones.mockResolvedValue({ _sum: { valor: 0 } })
  consultas.bonos.mockResolvedValue({ _sum: { valor: 0 } })
  consultas.horas.mockResolvedValue([])
  consultas.novedades.mockResolvedValue([])
})

describe('bases históricas y manuales', () => {
  it('usa la nómina anterior y conserva la referencia en el cálculo', async () => {
    consultas.nominas.mockResolvedValue([nomina])
    const b = await basesDesdeHistorial('persona', ingreso, retiro)
    expect(b).toMatchObject({ salarioBase: 3_000_000, auxilioTransporte: 249_095, origenSalario: 'NOMINA', origenAuxilio: 'NOMINA', diasSalarioPendiente: 30 })
    expect(b.referencia.nominaId).toBe('junio')
    expect(consultas.nominas).toHaveBeenCalledWith(expect.objectContaining({ where: { colaboradorId: 'persona', periodo: { fechaFin: { lte: retiro }, estado: { not: 'BORRADOR' } } } }))
  })

  it('sin historial exige salario y auxilio explícitos; cero es válido para el auxilio', async () => {
    await expect(basesDesdeHistorial('persona', ingreso, retiro)).rejects.toBeInstanceOf(ErrorBasesLiquidacion)
    await expect(basesDesdeHistorial('persona', ingreso, retiro, { salarioBase: 4_000_000 })).rejects.toThrow('auxilio')
    const b = await basesDesdeHistorial('persona', ingreso, retiro, { salarioBase: 4_000_000, auxilioTransporte: 0 })
    expect(b).toMatchObject({ salarioBase: 4_000_000, auxilioTransporte: 0, origenSalario: 'MANUAL', origenAuxilio: 'MANUAL' })
  })

  it('los ajustes guardados se pueden reutilizar y retirar para volver a la nómina', async () => {
    consultas.nominas.mockResolvedValue([nomina])
    const ajustes = { salarioBase: 3_500_000, auxilioTransporte: 0 }
    const primero = await basesDesdeHistorial('persona', ingreso, retiro, ajustes)
    const segundo = await basesDesdeHistorial('persona', ingreso, retiro, ajustes)
    expect(segundo).toEqual(primero)
    expect(await basesDesdeHistorial('persona', ingreso, retiro, { salarioBase: null, auxilioTransporte: null })).toMatchObject({ salarioBase: 3_000_000, auxilioTransporte: 249_095, origenSalario: 'NOMINA' })
  })

  it('completa meses manuales sin borrar los variables ya registrados y distingue cero conocido de mes faltante', async () => {
    consultas.nominas.mockResolvedValue([{ ...nomina, detalles: [...nomina.detalles, { conceptoCodigo: 'COMISION', tipo: 'DEVENGADO', valor: 300_000, base: null }] }])
    const b = await basesDesdeHistorial('persona', ingreso, retiro, { variablePorMes: [{ mes: '2026-07', valor: 500_000 }] })
    expect(b.promedioVariableAnual).toBe(Math.round(800_000 / (196 / 30)))
    expect(b.promedioVariableSemestre).toBe(500_000)
    const ventana = await mesesParaPromedios('persona', ingreso, retiro)
    expect(ventana.meses.find((m) => m.mes === '2026-06')).toMatchObject({ tieneNomina: true, valorConocido: 300_000 })
    expect(ventana.meses.find((m) => m.mes === '2026-05')).toMatchObject({ tieneNomina: false, valorConocido: 0 })
  })

  it('el ingreso manual mantiene los totales de la colilla de referencia', async () => {
    const b = await basesDesdeHistorial('persona', ingreso, retiro, {
      salarioBase: 1_750_905, auxilioTransporte: 249_095,
      promedioVariableAnual: 234_930, promedioVariableSemestre: 879_400,
      otroConceptoSalarial: 933_740, diasSalarioPendiente: 30,
    })
    const r = liquidacionDefinitiva({
      ...b, variableEnVacaciones: false, fechaIngreso: ingreso, fechaRetiro: retiro,
      tipo: 'RENUNCIA_VOLUNTARIA', tipoContrato: 'TERMINO_INDEFINIDO', fechaFinContrato: null,
      diasVacacionesPendientes: 196 * (15 / 360), saldoPrestamo: 0, smmlv: 1_750_905,
      porcentajeSalud: 0.04, porcentajePension: 0.04, porcentajeInteresesCesantias: 0.12,
    })
    expect(Math.abs(r.total - 4_731_845)).toBeLessThanOrEqual(2)
    expect(r.baseCesantias).toBe(2_234_930)
    expect(r.basePrima).toBe(2_879_400)
  })
})

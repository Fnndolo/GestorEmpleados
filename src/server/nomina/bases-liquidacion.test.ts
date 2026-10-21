import { beforeEach, describe, expect, it, vi } from 'vitest'

const consultas = vi.hoisted(() => ({
  nominas: vi.fn(), conceptos: vi.fn(), comisiones: vi.fn(), bonos: vi.fn(), horas: vi.fn(), novedades: vi.fn(),
  comisionesSueltas: vi.fn(), tiposHora: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ prisma: {
  liquidacionNomina: { findMany: consultas.nominas }, conceptoNomina: { findMany: consultas.conceptos },
  comision: { aggregate: consultas.comisiones, findMany: consultas.comisionesSueltas },
  tipoHora: { findMany: consultas.tiposHora }, bonificacion: { aggregate: consultas.bonos },
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
  consultas.comisionesSueltas.mockResolvedValue([])
  consultas.tiposHora.mockResolvedValue([])
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

  it('los meses sin nómina toman las comisiones y horas extra registradas en Novedades', async () => {
    consultas.nominas.mockResolvedValue([{ ...nomina, detalles: [...nomina.detalles, { conceptoCodigo: 'COMISION', tipo: 'DEVENGADO', valor: 300_000, base: null }] }])
    // Solo lo que ninguna nómina pagó (periodoId null): lo de junio ya va en su desprendible.
    consultas.comisionesSueltas.mockResolvedValue([{ fecha: D(2026, 3, 10), valor: 200_000 }])
    consultas.horas.mockResolvedValue([{ fecha: D(2026, 4, 5), tipoHora: 'HED', horas: 10 }])
    consultas.tiposHora.mockResolvedValue([{ codigo: 'HED', factor: 1.25, vigenteDesde: D(2025, 1, 1) }])
    const ajustes = { salarioBase: 2_200_000, auxilioTransporte: 0 }
    const valorHoras = Math.round((2_200_000 / 220) * 1.25 * 10)

    const b = await basesDesdeHistorial('persona', ingreso, retiro, ajustes)
    expect(b.promedioVariableAnual).toBe(Math.round((300_000 + 200_000 + valorHoras) / (196 / 30)))
    expect(consultas.comisionesSueltas).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ periodoId: null }) }))

    const ventana = await mesesParaPromedios('persona', ingreso, retiro, ajustes.salarioBase)
    expect(ventana.meses.find((m) => m.mes === '2026-03')).toMatchObject({ tieneNomina: false, valorConocido: 200_000, desdeNovedades: 200_000 })
    expect(ventana.meses.find((m) => m.mes === '2026-04')).toMatchObject({ tieneNomina: false, valorConocido: valorHoras })
    expect(ventana.meses.find((m) => m.mes === '2026-06')).toMatchObject({ tieneNomina: true, valorConocido: 300_000, desdeNovedades: 0 })

    // Un mes digitado a mano manda sobre lo de Novedades.
    const manual = await basesDesdeHistorial('persona', ingreso, retiro, { ...ajustes, variablePorMes: [{ mes: '2026-03', valor: 0 }] })
    expect(manual.promedioVariableAnual).toBe(Math.round((300_000 + valorHoras) / (196 / 30)))
  })
})

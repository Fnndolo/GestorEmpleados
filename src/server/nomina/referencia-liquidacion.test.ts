import { describe, expect, it } from 'vitest'
import { referenciaLiquidacion, type NominaReferencia } from './referencia-liquidacion'

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const nomina = (fechaFin = D(2026, 6, 30)): NominaReferencia => ({
  id: 'nomina-junio', salarioBase: 3_000_000, diasTrabajados: 15,
  periodo: { nombre: 'Junio · segunda quincena', fechaFin, esAjuste: false, parametrosSnapshot: { AUX_TRANSPORTE: 249_095 } },
  detalles: [{ conceptoCodigo: 'AUX_TRANSPORTE', tipo: 'DEVENGADO', valor: 124_548, base: null }],
})

describe('referencia salarial de una liquidación', () => {
  it('recupera el sueldo real y el auxilio mensual, sin confundirlos con la quincena', () => {
    const r = referenciaLiquidacion([nomina()], D(2026, 7, 31))
    expect(r.salarioBase).toBe(3_000_000)
    expect(r.auxilioTransporte).toBe(249_095)
    expect(r.nominaId).toBe('nomina-junio')
  })

  it('usa la nómina más reciente antes del retiro, ignorando futuros y ajustes', () => {
    const julio = { ...nomina(D(2026, 7, 31)), salarioBase: 3_500_000 }
    const ajuste = { ...nomina(D(2026, 6, 30)), salarioBase: 100_000, periodo: { ...nomina().periodo, esAjuste: true } }
    expect(referenciaLiquidacion([julio, ajuste, nomina()], D(2026, 7, 15)).salarioBase).toBe(3_000_000)
  })

  it('recupera el año histórico del retiro, aunque existan nóminas más recientes', () => {
    const anterior = { ...nomina(D(2025, 12, 31)), salarioBase: 1_423_500,
      periodo: { ...nomina().periodo, fechaFin: D(2025, 12, 31), parametrosSnapshot: { AUX_TRANSPORTE: 200_000 } } }
    expect(referenciaLiquidacion([nomina(), anterior], D(2025, 12, 31))).toMatchObject({ salarioBase: 1_423_500, auxilioTransporte: 200_000 })
  })

  it('pide valores manuales al cambiar de año sin nóminas nuevas, en vez de arrastrar los antiguos', () => {
    expect(referenciaLiquidacion([nomina(D(2025, 12, 31))], D(2026, 1, 15))).toMatchObject({ salarioBase: null, auxilioTransporte: null })
    expect(referenciaLiquidacion([], D(2026, 7, 31)).nominaId).toBeNull()
  })

  it('una nómina sin auxilio con días trabajados confirma auxilio cero', () => {
    expect(referenciaLiquidacion([{ ...nomina(), salarioBase: 6_000_000, detalles: [] }], D(2026, 7, 31)).auxilioTransporte).toBe(0)
    expect(referenciaLiquidacion([{ ...nomina(), diasTrabajados: 0, detalles: [] }], D(2026, 7, 31)).auxilioTransporte).toBeNull()
  })

  it('prefiere la base mensual registrada y soporta nóminas antiguas sin snapshot', () => {
    const n = nomina()
    n.periodo.parametrosSnapshot = null
    n.detalles[0].base = 249_095
    expect(referenciaLiquidacion([n], D(2026, 7, 31)).auxilioTransporte).toBe(249_095)
    n.detalles[0].base = null
    expect(referenciaLiquidacion([n], D(2026, 7, 31)).auxilioTransporte).toBeNull()
    n.diasTrabajados = 30
    n.detalles[0].valor = 200_000
    expect(referenciaLiquidacion([n], D(2026, 7, 31)).auxilioTransporte).toBe(200_000)
  })
})

import { describe, it, expect } from 'vitest'
import { diasFueraDelVinculo, diasSuperpuestos, pagoIncapacidad } from './ausencias'

const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d))

describe('diasSuperpuestos', () => {
  const inicio = D(7, 1)
  const fin = D(7, 31)

  it('ausencia completamente dentro del periodo', () => {
    expect(diasSuperpuestos(D(7, 5), D(7, 7), inicio, fin)).toBe(3)
  })

  it('un solo día', () => {
    expect(diasSuperpuestos(D(7, 10), D(7, 10), inicio, fin)).toBe(1)
  })

  it('ausencia que empieza antes del periodo se recorta', () => {
    expect(diasSuperpuestos(D(6, 28), D(7, 3), inicio, fin)).toBe(3) // 1,2,3 jul
  })

  it('ausencia que termina después del periodo se recorta', () => {
    expect(diasSuperpuestos(D(7, 30), D(8, 5), inicio, fin)).toBe(2) // 30,31 jul
  })

  it('sin fecha fin (suspensión abierta) cuenta hasta el fin del periodo', () => {
    expect(diasSuperpuestos(D(7, 20), null, inicio, fin)).toBe(12) // 20..31
  })

  it('fuera del periodo = 0', () => {
    expect(diasSuperpuestos(D(8, 1), D(8, 5), inicio, fin)).toBe(0)
  })
})

describe('pagoIncapacidad', () => {
  const SMMLV = 1_750_905

  it('66,67% del salario diario para salario alto', () => {
    // 3.000.000/30 = 100.000/día × 2/3 = 66.667/día × 3 días = 200.000
    expect(pagoIncapacidad(3, 3_000_000, SMMLV)).toBe(200_000)
  })

  it('piso: nunca por debajo del SMMLV diario', () => {
    // Mínimo: 58.363,5/día × 2/3 = 38.909 < piso 58.363,5 → paga el piso
    expect(pagoIncapacidad(3, SMMLV, SMMLV)).toBe(Math.round((SMMLV / 30) * 3))
  })

  it('0 días = 0', () => {
    expect(pagoIncapacidad(0, 3_000_000, SMMLV)).toBe(0)
  })
})

describe('diasFueraDelVinculo', () => {
  const julio = { fechaInicio: D(7, 1), fechaFin: D(7, 31), diasPeriodo: 30 }
  const febrero = { fechaInicio: D(2, 1), fechaFin: D(2, 28), diasPeriodo: 30 }

  it('mes completo: no descuenta nada', () => {
    expect(diasFueraDelVinculo(D(1, 15), null, julio)).toBe(0)
  })

  it('ingreso a mitad de mes: paga del 15 en adelante, 16 días', () => {
    expect(diasFueraDelVinculo(D(7, 15), null, julio)).toBe(14)
  })

  it('retiro a mitad de mes: paga hasta el 10, 10 días', () => {
    expect(diasFueraDelVinculo(D(1, 15), D(7, 10), julio)).toBe(20)
  })

  it('entra y sale dentro del mismo mes', () => {
    expect(diasFueraDelVinculo(D(7, 6), D(7, 20), julio)).toBe(15) // 5 antes + 10 después
  })

  it('el día 31 no se paga aparte: retirarse el 31 es el mes completo', () => {
    expect(diasFueraDelVinculo(D(1, 15), D(7, 31), julio)).toBe(0)
  })

  it('febrero se paga como si tuviera 30 días', () => {
    expect(diasFueraDelVinculo(D(2, 15), null, febrero)).toBe(14)
    expect(diasFueraDelVinculo(D(1, 1), D(2, 28), febrero)).toBe(0)
  })

  it('quincena: solo cuenta dentro de su rango', () => {
    const q2 = { fechaInicio: D(7, 16), fechaFin: D(7, 31), diasPeriodo: 15 }
    expect(diasFueraDelVinculo(D(1, 1), D(7, 20), q2)).toBe(10) // paga 5 días
    expect(diasFueraDelVinculo(D(7, 16), null, q2)).toBe(0)
  })

  it('retiro anterior al periodo: no le corresponde nada', () => {
    expect(diasFueraDelVinculo(D(1, 1), D(6, 30), julio)).toBe(30)
  })
})

describe('pagoIncapacidad según origen y duración', () => {
  const SALARIO = 3_000_000 // $100.000 diarios
  const SMMLV = 1_750_905

  it('enfermedad general: 66,67% del salario diario', () => {
    expect(pagoIncapacidad(3, SALARIO, SMMLV)).toBe(Math.round(3 * ((SALARIO / 30) * 2) / 3))
  })

  it('accidente de trabajo: 100%, no 66,67%', () => {
    // Ley 776 de 2002: la ARL paga el 100% del IBC. Pagarlo como enfermedad
    // general le quita a la persona un tercio de su salario por accidentarse.
    expect(pagoIncapacidad(3, SALARIO, SMMLV, 'ACCIDENTE_TRABAJO')).toBe(300_000)
    expect(pagoIncapacidad(3, SALARIO, SMMLV, 'ENFERMEDAD_LABORAL')).toBe(300_000)
  })

  it('licencias de maternidad y paternidad: 100% (Ley 1822 de 2017)', () => {
    expect(pagoIncapacidad(30, SALARIO, SMMLV, 'LICENCIA_MATERNIDAD')).toBe(3_000_000)
    expect(pagoIncapacidad(14, SALARIO, SMMLV, 'LICENCIA_PATERNIDAD')).toBe(1_400_000)
  })

  it('enfermedad general baja al 50% desde el día 91', () => {
    const dia91 = pagoIncapacidad(1, SALARIO, SMMLV, 'ENFERMEDAD_GENERAL', 91)
    expect(dia91).toBe(Math.round(Math.max((SALARIO / 30) / 2, SMMLV / 30)))
    // El día 90 todavía va al 66,67%.
    expect(pagoIncapacidad(1, SALARIO, SMMLV, 'ENFERMEDAD_GENERAL', 90)).toBeGreaterThan(dia91)
  })

  it('un tramo que cruza el día 90 se parte: unos días a 2/3 y otros a 1/2', () => {
    const cruzado = pagoIncapacidad(4, SALARIO, SMMLV, 'ENFERMEDAD_GENERAL', 89)
    const todoADosTercios = pagoIncapacidad(4, SALARIO, SMMLV, 'ENFERMEDAD_GENERAL', 1)
    const todoAMitad = pagoIncapacidad(4, SALARIO, SMMLV, 'ENFERMEDAD_GENERAL', 91)
    expect(cruzado).toBeLessThan(todoADosTercios)
    expect(cruzado).toBeGreaterThan(todoAMitad)
  })

  it('nunca paga menos de un salario mínimo diario', () => {
    // Quien gana el mínimo: dos tercios quedarían por debajo del piso legal.
    const dias = 10
    expect(pagoIncapacidad(dias, SMMLV, SMMLV)).toBe(Math.round(dias * (SMMLV / 30)))
  })
})

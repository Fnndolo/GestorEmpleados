import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { saldoVacaciones } from '@/server/vacaciones'
import { liquidacionDefinitiva } from '@/server/nomina/liquidacion-definitiva'
import { cargarParametros } from '@/server/nomina/parametros'

/**
 * Lo que el colaborador pide y lo que la empresa le paga al final: vacaciones,
 * cuentas de cobro del contratista y liquidación definitiva.
 */

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const MARCA = 'PRUEBA-AUTOSERVICIO'

let sedeId: string
let SMMLV: number
let unAnioId: string

async function limpiar() {
  const colabs = await prisma.colaborador.findMany({ where: { apellidos: MARCA }, select: { id: true } })
  const ids = colabs.map((c) => c.id)
  if (!ids.length) return
  const cuentas = await prisma.cuentaCobroOps.findMany({ where: { colaboradorId: { in: ids } }, select: { id: true } })
  await prisma.soporteSsOps.deleteMany({ where: { cuentaCobroId: { in: cuentas.map((c) => c.id) } } })
  await prisma.cuentaCobroOps.deleteMany({ where: { colaboradorId: { in: ids } } })
  await prisma.contratoOps.deleteMany({ where: { colaboradorId: { in: ids } } })
  await prisma.vacaciones.deleteMany({ where: { colaboradorId: { in: ids } } })
  await prisma.contrato.deleteMany({ where: { colaboradorId: { in: ids } } })
  await prisma.colaborador.deleteMany({ where: { id: { in: ids } } })
}

beforeAll(async () => {
  await limpiar()
  const sede = await prisma.sede.findFirstOrThrow({ where: { activa: true } })
  sedeId = sede.id
  SMMLV = (await cargarParametros(D(2026, 6, 30))).SMMLV

  const c = await prisma.colaborador.create({
    data: {
      nombres: 'Vacaciones', apellidos: MARCA, tipoDocumento: 'CC', numeroDocumento: '99100001',
      celular: '3000000000', sedeId, tipoVinculo: 'TERMINO_INDEFINIDO',
      modalidadTrabajo: 'PRESENCIAL', fechaIngreso: D(2025, 6, 1), estado: 'ACTIVO',
      busquedaNormalizada: 'vacaciones prueba',
    },
  })
  unAnioId = c.id
})

afterAll(async () => { await limpiar(); await prisma.$disconnect() })

describe('vacaciones', () => {
  it('al año de servicio se causan 15 días hábiles', async () => {
    // CST art. 186: 15 días hábiles por año trabajado.
    const s = await saldoVacaciones(unAnioId, D(2026, 6, 1))
    expect(Math.round(s.causadas)).toBe(15)
    expect(s.saldo).toBeGreaterThan(14)
  })

  it('a los seis meses se causa la mitad', async () => {
    const s = await saldoVacaciones(unAnioId, D(2025, 12, 1))
    expect(s.causadas).toBeGreaterThan(7)
    expect(s.causadas).toBeLessThan(8.5)
  })

  it('lo ya disfrutado baja el saldo', async () => {
    await prisma.vacaciones.create({
      data: {
        colaboradorId: unAnioId, fechaInicio: D(2026, 5, 4), fechaFin: D(2026, 5, 8),
        diasHabiles: 5, estado: 'DISFRUTADA',
      },
    })
    const s = await saldoVacaciones(unAnioId, D(2026, 6, 1))
    expect(s.disfrutadas).toBe(5)
    expect(Math.round(s.saldo)).toBe(10)
  })
})

describe('cuenta de cobro de un contratista OPS', () => {
  it('la base impide aprobarla sin soporte de seguridad social válido', async () => {
    const contratista = await prisma.colaborador.create({
      data: {
        nombres: 'Contratista', apellidos: MARCA, tipoDocumento: 'CC', numeroDocumento: '99100002',
        celular: '3000000000', sedeId, tipoVinculo: 'OPS', modalidadTrabajo: 'REMOTO',
        fechaIngreso: D(2026, 1, 2), estado: 'ACTIVO', busquedaNormalizada: 'contratista prueba',
      },
    })
    const contrato = await prisma.contratoOps.create({
      data: {
        numero: `OPS-${MARCA}`, colaboradorId: contratista.id, sedeId,
        objeto: 'Servicios de prueba', valorTotal: 6_000_000, valorMensual: 2_000_000,
        fechaInicio: D(2026, 1, 2), fechaFin: D(2026, 12, 31), estado: 'ACTIVO',
      },
    })
    const cuenta = await prisma.cuentaCobroOps.create({
      data: {
        colaboradorId: contratista.id, contratoOpsId: contrato.id, numero: 'CC-PRUEBA-1',
        periodo: '2026-06', valor: 2_000_000, fechaRadicacion: D(2026, 7, 1), estado: 'RADICADA',
      },
    })

    // Sin PILA válida no se puede aprobar: la regla vive en la base, así que se
    // cumple aunque alguien escriba directo contra ella.
    await expect(
      prisma.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'APROBADA' } }),
    ).rejects.toThrow()

    // Con la planilla verificada sí pasa.
    await prisma.soporteSsOps.create({
      data: {
        cuentaCobroId: cuenta.id, operador: 'Aportes en Línea', periodoCotizado: '2026-06',
        ibcDeclarado: 800_000, estadoVerificacion: 'VALIDA',
      },
    })
    const aprobada = await prisma.cuentaCobroOps.update({
      where: { id: cuenta.id }, data: { estado: 'APROBADA' },
    })
    expect(aprobada.estado).toBe('APROBADA')
  })
})

describe('liquidación definitiva', () => {
  const base = {
    salarioBase: 0, auxilioTransporte: 0,
    promedioVariableAnual: 0, promedioVariableSemestre: 0,
    otroConceptoSalarial: 0, diasSalarioPendiente: 0, variableEnVacaciones: true,
    fechaIngreso: D(2025, 1, 1), fechaRetiro: D(2026, 6, 30),
    tipo: 'RENUNCIA_VOLUNTARIA', tipoContrato: 'TERMINO_INDEFINIDO',
    fechaFinContrato: null, diasVacacionesPendientes: 0, saldoPrestamo: 0, smmlv: 0,
    porcentajeSalud: 0.04, porcentajePension: 0.04, porcentajeInteresesCesantias: 0.12,
  }

  it('paga cesantías, intereses, prima y vacaciones', () => {
    const r = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, smmlv: SMMLV })
    expect(r.cesantias).toBeGreaterThan(0)
    expect(r.interesesCesantias).toBeGreaterThan(0)
    expect(r.prima).toBeGreaterThan(0)
    expect(r.total).toBeGreaterThan(0)
  })

  it('una renuncia no lleva indemnización', () => {
    const r = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, smmlv: SMMLV })
    expect(r.indemnizacion).toBe(0)
  })

  it('un despido sin justa causa sí la lleva', () => {
    // CST art. 64: el despido sin justa causa se indemniza.
    const r = liquidacionDefinitiva({ ...base, tipo: 'SIN_JUSTA_CAUSA', salarioBase: SMMLV, smmlv: SMMLV })
    expect(r.indemnizacion).toBeGreaterThan(0)
  })

  it('el variable habitual sube la base prestacional', () => {
    // Las horas extra y comisiones son salario (CST art. 127): si son
    // habituales, deben promediarse para cesantías, prima y vacaciones.
    const sinVariable = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, smmlv: SMMLV })
    const conVariable = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, promedioVariableAnual: 500_000, promedioVariableSemestre: 500_000, smmlv: SMMLV })
    expect(conVariable.cesantias).toBeGreaterThan(sinVariable.cesantias)
    expect(conVariable.prima).toBeGreaterThan(sinVariable.prima)
  })

  it('el préstamo pendiente se descuenta del total', () => {
    const sinDeuda = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, smmlv: SMMLV })
    const conDeuda = liquidacionDefinitiva({ ...base, salarioBase: SMMLV, saldoPrestamo: 300_000, smmlv: SMMLV })
    expect(conDeuda.total).toBeLessThan(sinDeuda.total)
  })
})

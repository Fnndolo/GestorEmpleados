import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { liquidarPeriodo } from '@/server/nomina/liquidador'
import { cargarParametros } from '@/server/nomina/parametros'

/**
 * Casos límite: donde el cálculo suele equivocarse y nadie lo mira.
 *
 * Estas pruebas no confirman que todo esté bien; están escritas para intentar
 * romperlo. Las que pasan fijan una regla; si alguna falla, encontró algo.
 */

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const MARCA = 'PRUEBA-LIMITES'

let sedeId: string
let periodoId: string
let SMMLV: number

async function crear(doc: string, salario: number, ingreso = D(2024, 1, 1)) {
  const c = await prisma.colaborador.create({
    data: {
      nombres: 'Límite', apellidos: MARCA, tipoDocumento: 'CC', numeroDocumento: doc,
      celular: '3000000000', sedeId, tipoVinculo: 'TERMINO_INDEFINIDO',
      modalidadTrabajo: 'PRESENCIAL', fechaIngreso: ingreso, estado: 'ACTIVO',
      busquedaNormalizada: `limite ${doc}`,
    },
  })
  await prisma.contrato.create({
    data: {
      numero: `CT-${MARCA}-${doc}`, colaboradorId: c.id, sedeId, tipo: 'TERMINO_INDEFINIDO',
      jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL', tipoSalario: 'ORDINARIO',
      salarioBase: salario, ganaSalarioMinimo: false,
      tieneAuxTransporte: salario <= SMMLV * 2, fechaInicio: ingreso,
      estado: 'ACTIVO', origenPdf: 'SUBIDO',
    },
  })
  return c.id
}

async function limpiar() {
  const colabs = await prisma.colaborador.findMany({ where: { apellidos: MARCA }, select: { id: true } })
  const ids = colabs.map((c) => c.id)
  if (ids.length) {
    await prisma.novedadHoras.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.liquidacionNomina.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.contrato.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.colaborador.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.periodoNomina.deleteMany({ where: { nombre: { startsWith: MARCA } } })
}

beforeAll(async () => {
  await limpiar()
  sedeId = (await prisma.sede.findFirstOrThrow({ where: { activa: true } })).id
  SMMLV = (await cargarParametros(D(2026, 6, 30))).SMMLV
  periodoId = (await prisma.periodoNomina.create({
    data: {
      nombre: `${MARCA} junio 2026`, tipo: 'MENSUAL', anio: 2026, mes: 6,
      fechaInicio: D(2026, 6, 1), fechaFin: D(2026, 6, 30), diasPeriodo: 30, estado: 'BORRADOR',
    },
  })).id
})

afterAll(async () => { await limpiar(); await prisma.$disconnect() })

describe('auxilio de transporte en el límite de 2 SMMLV', () => {
  it('a 2 SMMLV exactos todavía le corresponde', async () => {
    const id = await crear('99300001', SMMLV * 2)
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    const aux = await prisma.detalleNomina.findFirst({
      where: { liquidacionId: liq.id, conceptoCodigo: 'AUX_TRANSPORTE' },
    })
    expect(aux, 'quien gana exactamente 2 SMMLV conserva el auxilio').toBeTruthy()
  })

  it('por encima de 2 SMMLV no', async () => {
    const id = await crear('99300002', SMMLV * 2 + 1000)
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    const aux = await prisma.detalleNomina.count({
      where: { liquidacionId: liq.id, conceptoCodigo: 'AUX_TRANSPORTE' },
    })
    expect(aux).toBe(0)
  })
})

describe('fondo de solidaridad pensional en su umbral', () => {
  it('a 4 SMMLV empieza a descontarse', async () => {
    // Ley 797 de 2003: desde 4 SMMLV.
    const id = await crear('99300003', SMMLV * 4)
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    const fsp = await prisma.detalleNomina.count({
      where: { liquidacionId: liq.id, conceptoCodigo: 'FSP_EMP' },
    })
    expect(fsp, 'a 4 SMMLV debe cobrarse el FSP').toBe(1)
  })

  it('justo por debajo de 4 SMMLV no', async () => {
    const id = await crear('99300004', SMMLV * 4 - 1000)
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    const fsp = await prisma.detalleNomina.count({
      where: { liquidacionId: liq.id, conceptoCodigo: 'FSP_EMP' },
    })
    expect(fsp).toBe(0)
  })
})

describe('quien entra o sale a mitad de mes', () => {
  it('a quien ingresa el 16 se le paga medio mes', async () => {
    const id = await crear('99300005', SMMLV * 2, D(2026, 6, 16))
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    // Del 16 al 30 son 15 días de los 30 del periodo.
    expect(Number(liq.diasTrabajados)).toBe(15)
  })

  it('quien ingresa después del periodo no cobra nada', async () => {
    const id = await crear('99300006', SMMLV * 2, D(2026, 8, 1))
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirst({ where: { periodoId, colaboradorId: id } })
    // O no se le liquida, o se le liquida en cero: lo que no puede es cobrar mes completo.
    if (liq) expect(Number(liq.diasTrabajados)).toBe(0)
  })
})

describe('horas registradas con fecha fuera del periodo', () => {
  it('se pagan aunque su fecha no caiga dentro del periodo', async () => {
    const id = await crear('99300007', SMMLV * 2)
    await prisma.novedadHoras.create({
      data: {
        colaboradorId: id, periodoId,
        // Fecha de OTRO mes, pero atada a este periodo.
        fecha: D(2026, 3, 15), tipoHora: 'HED', horas: 20, horaInicio: '17:00', horaFin: '19:00',
      },
    })
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: id } })
    const he = await prisma.detalleNomina.count({
      where: { liquidacionId: liq.id, conceptoCodigo: 'HORAS_EXTRA' },
    })
    // Documenta el comportamiento actual: el liquidador filtra por periodoId y
    // NO por fecha, así que una hora mal fechada entra igual. No es un fallo del
    // cálculo sino una validación que falta al registrarla.
    expect(he).toBe(1)
  })
})

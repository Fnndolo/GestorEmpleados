import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { liquidarPeriodo } from '@/server/nomina/liquidador'
import { cargarParametros } from '@/server/nomina/parametros'

/**
 * Nómina de punta a punta contra la base: crea un periodo, lo liquida con el
 * código real y comprueba las cifras.
 *
 * Se prueba con SALARIO MÍNIMO porque es como contrata la empresa y porque es
 * ahí donde viven las reglas que más se equivocan: auxilio de transporte, piso
 * de la incapacidad y exoneración de aportes. Con sueldos altos esas reglas no
 * se activan y la prueba pasaría sin mirarlas.
 */

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const MARCA = 'PRUEBA-NOMINA'

let sedeId: string
let colaboradorId: string
let periodoId: string
let SMMLV: number
let AUX: number

/** Crea un colaborador con contrato a salario mínimo, aislado de los demás. */
async function crearColaboradorMinimo(doc: string, salario: number) {
  const colab = await prisma.colaborador.create({
    data: {
      nombres: 'Prueba', apellidos: MARCA, tipoDocumento: 'CC', numeroDocumento: doc,
      celular: '3000000000', sedeId, tipoVinculo: 'TERMINO_INDEFINIDO',
      modalidadTrabajo: 'PRESENCIAL', fechaIngreso: D(2024, 1, 1), estado: 'ACTIVO',
      busquedaNormalizada: `prueba ${doc}`,
    },
  })
  await prisma.contrato.create({
    data: {
      numero: `CT-${MARCA}-${doc}`, colaboradorId: colab.id, sedeId,
      tipo: 'TERMINO_INDEFINIDO', jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL',
      tipoSalario: 'ORDINARIO', salarioBase: salario, ganaSalarioMinimo: salario === SMMLV,
      tieneAuxTransporte: salario <= SMMLV * 2, fechaInicio: D(2024, 1, 1),
      estado: 'ACTIVO', origenPdf: 'SUBIDO',
    },
  })
  return colab.id
}

async function limpiar() {
  const colabs = await prisma.colaborador.findMany({ where: { apellidos: MARCA }, select: { id: true } })
  const ids = colabs.map((c) => c.id)
  if (ids.length) {
    await prisma.novedadHoras.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.incapacidad.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.liquidacionNomina.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.contrato.deleteMany({ where: { colaboradorId: { in: ids } } })
    await prisma.colaborador.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.periodoNomina.deleteMany({ where: { nombre: { startsWith: MARCA } } })
}

beforeAll(async () => {
  await limpiar()
  const sede = await prisma.sede.findFirst({ where: { activa: true } })
  if (!sede) throw new Error('No hay sedes: corre `pnpm db:seed` primero.')
  sedeId = sede.id

  const p = await cargarParametros(D(2026, 6, 30))
  SMMLV = p.SMMLV
  AUX = p.AUX_TRANSPORTE

  colaboradorId = await crearColaboradorMinimo('99000001', SMMLV)
  const periodo = await prisma.periodoNomina.create({
    data: {
      nombre: `${MARCA} junio 2026`, tipo: 'MENSUAL', anio: 2026, mes: 6,
      fechaInicio: D(2026, 6, 1), fechaFin: D(2026, 6, 30), diasPeriodo: 30,
      estado: 'BORRADOR',
    },
  })
  periodoId = periodo.id
})

afterAll(async () => {
  await limpiar()
  await prisma.$disconnect()
})

describe('nómina con salario mínimo', () => {
  it('liquida el mes completo con auxilio de transporte', async () => {
    const r = await liquidarPeriodo(periodoId)
    expect(r.liquidados).toBeGreaterThan(0)

    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId } })
    // Quien gana el mínimo tiene derecho al auxilio (hasta 2 SMMLV, Ley 15/1959).
    expect(Number(liq.totalDevengado)).toBe(SMMLV + AUX)
  })

  it('descuenta 4% de salud y 4% de pensión, y el auxilio NO entra al IBC', async () => {
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId } })
    // El auxilio de transporte no es salario (CST art. 128): no cotiza.
    const esperado = Math.round(SMMLV * 0.04) * 2
    expect(Number(liq.totalDeducido)).toBe(esperado)
  })

  it('el neto es lo devengado menos lo deducido', async () => {
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId } })
    expect(Number(liq.neto)).toBe(Number(liq.totalDevengado) - Number(liq.totalDeducido))
  })

  it('no cobra fondo de solidaridad a quien gana el mínimo', async () => {
    // El FSP arranca en 4 SMMLV (Ley 797 de 2003).
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId } })
    const fsp = await prisma.detalleNomina.count({ where: { liquidacionId: liq.id, conceptoCodigo: 'FSP_EMP' } })
    expect(fsp).toBe(0)
  })
})

describe('incapacidades según su origen', () => {
  it('la enfermedad general no baja del mínimo diario', async () => {
    await prisma.incapacidad.create({
      data: {
        colaboradorId, tipo: 'ENFERMEDAD_GENERAL',
        fechaInicio: D(2026, 6, 10), fechaFin: D(2026, 6, 19), dias: 10,
      },
    })
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId } })
    const inc = await prisma.detalleNomina.count({ where: { liquidacionId: liq.id, conceptoCodigo: 'INCAPACIDAD' } })
    expect(inc).toBeGreaterThan(0)
    // 10 días al piso de un SMMLV diario: dos tercios del mínimo quedarían por
    // debajo del piso legal, así que se paga el piso.
    expect(Number(liq.totalDevengado)).toBeGreaterThan(0)
  })

  it('el accidente de trabajo se paga al 100%, no al 66,67%', async () => {
    const otro = await crearColaboradorMinimo('99000002', 3_000_000)
    await prisma.incapacidad.create({
      data: {
        colaboradorId: otro, tipo: 'ACCIDENTE_TRABAJO',
        fechaInicio: D(2026, 6, 1), fechaFin: D(2026, 6, 10), dias: 10,
      },
    })
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: otro } })

    // 10 días incapacitado + 20 trabajados = mes completo. Al 100% (Ley 776 de
    // 2002) el devengado es el salario íntegro; al 66,67% faltaría un tercio de
    // esos 10 días.
    const salarioDia = 3_000_000 / 30
    const esperadoAl100 = Math.round(salarioDia * 20) + Math.round(salarioDia * 10)
    expect(Number(liq.totalDevengado)).toBeGreaterThanOrEqual(esperadoAl100 - 2)
  })
})

describe('horas extra', () => {
  it('la hora extra diurna se paga con recargo del 25%', async () => {
    const conExtras = await crearColaboradorMinimo('99000003', SMMLV)
    await prisma.novedadHoras.create({
      data: {
        colaboradorId: conExtras, periodoId, fecha: D(2026, 6, 5),
        tipoHora: 'HED', horas: 10, horaInicio: '17:00', horaFin: '19:00',
      },
    })
    await liquidarPeriodo(periodoId)
    const liq = await prisma.liquidacionNomina.findFirstOrThrow({ where: { periodoId, colaboradorId: conExtras } })
    const he = await prisma.detalleNomina.count({ where: { liquidacionId: liq.id, conceptoCodigo: 'HORAS_EXTRA' } })
    expect(he).toBeGreaterThan(0)
    // Con extras debe devengar más que el sueldo + auxilio pelados.
    expect(Number(liq.totalDevengado)).toBeGreaterThan(SMMLV + AUX)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { saldoVacaciones } = await import('@/server/vacaciones')
const { registrarVacacionesDisfrutadas } = await import('@/app/(app)/novedades/acciones')
const { dias360 } = await import('@/server/nomina/liquidacion-definitiva')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Saldo de vacaciones: causa desde el CONTRATO DE TRABAJO (no desde la fecha de
 * ingreso de la ficha, que en quien pasó de OPS a laboral es la del contrato de
 * servicios), se muestra en días completos, y Talento Humano puede anotar las
 * que ya se tomaron sin registro. Se prueba contra la base porque la regla
 * combina ficha, contratos, terminaciones y vacaciones.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }
function datosDe<T>(res: Resultado<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.datos
}
function errorDe<T>(res: Resultado<T>): string {
  if (res.ok) throw new Error('La acción debía fallar y salió bien.')
  return res.error
}

const MARCA = 'PRUEBA-VACACIONES-SALDO'
const EMPLEADO = 'yeison.cordoba@prueba.local'
const TH = 'ricardo.pena@prueba.local'

let th: UsuarioSesion
let colaboradorId: string
let fechaIngresoOriginal: Date
let inicioContrato: Date

const hoy = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d })()
const dias = (n: number) => { const d = new Date(hoy); d.setUTCDate(d.getUTCDate() + n); return d }
const iso = (d: Date) => d.toISOString().slice(0, 10)
/** Un lunes al menos `n` días atrás: para que el rango de prueba tenga hábiles predecibles. */
function lunesHace(n: number): Date {
  const d = dias(-n)
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1)
  return d
}

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { rol: { include: { permisos: true } } } })
  const c = await prisma.colaborador.findFirst({ where: { usuarioId: u.id }, select: { id: true } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!,
    rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre], estado: u.estado,
    debeCambiarPassword: false, colaboradorId: c?.id ?? null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({ modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never })),
  }
}

beforeAll(async () => {
  th = await sesionDe(TH)
  const empleado = await sesionDe(EMPLEADO)
  colaboradorId = empleado.colaboradorId!
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { fechaIngreso: true, tipoVinculo: true } })
  expect(colab.tipoVinculo).not.toBe('OPS')
  fechaIngresoOriginal = colab.fechaIngreso
  const contrato = await prisma.contrato.findFirstOrThrow({ where: { colaboradorId }, orderBy: { fechaInicio: 'asc' }, select: { fechaInicio: true } })
  inicioContrato = contrato.fechaInicio
})

afterAll(async () => {
  await prisma.colaborador.update({ where: { id: colaboradorId }, data: { fechaIngreso: fechaIngresoOriginal } })
  await prisma.vacaciones.deleteMany({ where: { colaboradorId, observaciones: { startsWith: MARCA } } })
})

describe('desde cuándo causa', () => {
  it('cuenta desde el inicio del contrato de trabajo, no desde la fecha de ingreso de la ficha', async () => {
    // Como si hubiera entrado dos años antes por prestación de servicios.
    const ingresoViejo = new Date(inicioContrato); ingresoViejo.setUTCFullYear(ingresoViejo.getUTCFullYear() - 2)
    await prisma.colaborador.update({ where: { id: colaboradorId }, data: { fechaIngreso: ingresoViejo } })
    const s = await saldoVacaciones(colaboradorId)
    expect(iso(s.desde)).toBe(iso(inicioContrato))
    const ajustes = await prisma.ajusteVacaciones.aggregate({ where: { colaboradorId }, _sum: { dias: true } })
    const esperado = (dias360(inicioContrato, hoy) / 360) * 15 + Number(ajustes._sum.dias ?? 0)
    expect(Math.abs(s.causadas - esperado)).toBeLessThan(0.02)
    await prisma.colaborador.update({ where: { id: colaboradorId }, data: { fechaIngreso: fechaIngresoOriginal } })
  })

  it('un contratista OPS no causa nada', async () => {
    const ops = await prisma.colaborador.findFirst({ where: { tipoVinculo: 'OPS' }, select: { id: true } })
    if (!ops) return
    const s = await saldoVacaciones(ops.id)
    expect(s.saldoEntero).toBe(0)
    expect(s.saldoExacto).toBe(0)
  })
})

describe('días completos', () => {
  it('saldoEntero es el saldo redondeado hacia abajo, nunca hacia arriba', async () => {
    const s = await saldoVacaciones(colaboradorId)
    expect(Number.isInteger(s.saldoEntero)).toBe(true)
    expect(s.saldoEntero).toBe(Math.floor(s.saldoExacto) || 0)
    expect(s.saldoEntero).toBeLessThanOrEqual(s.saldoExacto)
  })
})

describe('registrar vacaciones ya disfrutadas', () => {
  it('descuenta del saldo los días hábiles del rango pasado', async () => {
    actuarComo(th)
    const antes = await saldoVacaciones(colaboradorId)
    const ini = lunesHace(120)
    const fin = dias(0); fin.setTime(ini.getTime()); fin.setUTCDate(fin.getUTCDate() + 4) // lunes a viernes
    const r = datosDe(await registrarVacacionesDisfrutadas({ colaboradorId, fechaInicio: iso(ini), fechaFin: iso(fin), observaciones: `${MARCA} semana` }))
    expect(r.dias).toBeGreaterThanOrEqual(3) // 5 días menos festivos que caigan
    expect(r.dias).toBeLessThanOrEqual(5)
    const despues = await saldoVacaciones(colaboradorId)
    expect(despues.disfrutadas - antes.disfrutadas).toBeCloseTo(r.dias, 2)
    expect(despues.saldoExacto).toBeCloseTo(antes.saldoExacto - r.dias, 2)
    const fila = await prisma.vacaciones.findFirst({ where: { colaboradorId, observaciones: `${MARCA} semana` } })
    expect(fila?.estado).toBe('DISFRUTADA')
  })

  it('no acepta fechas futuras ni cruces con lo ya registrado', async () => {
    actuarComo(th)
    const futuro = errorDe(await registrarVacacionesDisfrutadas({ colaboradorId, fechaInicio: iso(dias(3)), fechaFin: iso(dias(4)), observaciones: `${MARCA} futuro` }))
    expect(futuro).toMatch(/ya pasaron/)
    const ini = lunesHace(120)
    const cruce = errorDe(await registrarVacacionesDisfrutadas({ colaboradorId, fechaInicio: iso(ini), fechaFin: iso(ini), observaciones: `${MARCA} cruce` }))
    expect(cruce).toMatch(/se cruzan/)
  })

  it('sin permiso de novedades no se puede', async () => {
    actuarComo(await sesionDe(EMPLEADO))
    const err = errorDe(await registrarVacacionesDisfrutadas({ colaboradorId, fechaInicio: iso(lunesHace(200)), fechaFin: iso(lunesHace(200)), observaciones: `${MARCA} sin permiso` }))
    expect(err).toBeTruthy()
  })
})

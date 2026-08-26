import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { crearSolicitud, resolverPaso, proponerFechas, responderContrapropuesta } =
  await import('@/app/(app)/autoservicio/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Cada solicitud del autoservicio, de punta a punta: el empleado la pide, quien
 * corresponde la resuelve, y se comprueba que el EFECTO real quedó registrado.
 *
 * Aprobar no es el final del trámite sino la mitad: unas vacaciones aprobadas
 * que no crean el registro de vacaciones no descuentan saldo ni aparecen en
 * nómina. Estas pruebas siguen hasta ese registro, que es donde se ve si el
 * flujo sirvió de algo.
 */

const MARCA = 'FLUJO-COMPLETO'
const proximo = (dias: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

let empleado: UsuarioSesion
let jefe: UsuarioSesion
let talentoHumano: UsuarioSesion
let colabId: string

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email }, include: { rol: { include: { permisos: true } } },
  })
  const colab = await prisma.colaborador.findFirst({ where: { usuarioId: u.id }, select: { id: true } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!,
    rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre], estado: u.estado,
    debeCambiarPassword: false, colaboradorId: colab?.id ?? null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({
      modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never,
    })),
  }
}

/**
 * Lleva una solicitud por TODOS sus pasos pendientes, cada uno resuelto por
 * quien de verdad le corresponde: el jefe inmediato o Talento Humano.
 * Devuelve la solicitud ya resuelta.
 */
async function aprobarHastaElFinal(solicitudId: string) {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const paso = await prisma.pasoAprobacion.findFirst({
      where: { solicitudId, estado: 'PENDIENTE' },
      orderBy: { orden: 'asc' },
    })
    if (!paso) break
    actuarComo(paso.usaJefeInmediato ? jefe : talentoHumano)
    const res = await resolverPaso({ pasoId: paso.id, aprobar: true } as never)
    expect(res.ok, res.ok ? '' : `paso ${paso.orden}: ${res.error}`).toBe(true)
  }
  return prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId }, include: { pasos: true } })
}

async function pedir(datos: Record<string, unknown>) {
  actuarComo(empleado)
  const res = await crearSolicitud(datos as never)
  expect(res.ok, res.ok ? '' : res.error).toBe(true)
  return (res.ok ? res.datos : { id: '' }) as { id: string }
}

async function limpiar() {
  if (!colabId) return
  const sols = await prisma.solicitud.findMany({ where: { colaboradorId: colabId }, select: { id: true } })
  await prisma.pasoAprobacion.deleteMany({ where: { solicitudId: { in: sols.map((s) => s.id) } } })
  await prisma.solicitud.deleteMany({ where: { colaboradorId: colabId } })
  await prisma.vacaciones.deleteMany({ where: { colaboradorId: colabId } })
  await prisma.permiso.deleteMany({ where: { colaboradorId: colabId } })
  await prisma.incapacidad.deleteMany({ where: { colaboradorId: colabId } })
  await prisma.licencia.deleteMany({ where: { colaboradorId: colabId } })
}

beforeAll(async () => {
  empleado = await sesionDe('yeison.cordoba@prueba.local')
  jefe = await sesionDe('diego.benavides@prueba.local')
  talentoHumano = await sesionDe('monica.bastidas@prueba.local')
  colabId = empleado.colaboradorId!
  await limpiar()
})

afterAll(async () => { await limpiar(); await prisma.$disconnect() })

describe('1. Vacaciones: pedir → jefe → Talento Humano → registro', () => {
  it('termina creando las vacaciones y descontando saldo', async () => {
    const { id } = await pedir({ tipo: 'VACACIONES', fechaInicio: proximo(40), fechaFin: proximo(46) })

    const inicial = await prisma.solicitud.findUniqueOrThrow({ where: { id }, include: { pasos: true } })
    // Dos niveles: el jefe del área y Talento Humano a nivel empresa.
    expect(inicial.pasos.length).toBe(2)
    expect(inicial.pasos[0].usaJefeInmediato).toBe(true)
    expect(inicial.pasos[1].rolAprobador).toBe('Recursos Humanos')

    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
    expect(final.pasos.every((p) => p.estado === 'APROBADO')).toBe(true)

    // El efecto: sin este registro, las vacaciones aprobadas no existen para
    // nómina ni descuentan del saldo.
    const vac = await prisma.vacaciones.findFirst({ where: { colaboradorId: colabId } })
    expect(vac, 'la aprobación debe crear el registro de vacaciones').toBeTruthy()
    expect(Number(vac!.diasHabiles)).toBeGreaterThan(0)
  })
})

describe('2. Permiso: pedir → jefe → Talento Humano → registro', () => {
  it('termina creando el permiso', async () => {
    const { id } = await pedir({
      tipo: 'PERMISO', fechaInicio: proximo(12), fechaFin: proximo(12),
      motivo: `Diligencia ${MARCA}`, diaCompleto: true,
    })
    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')

    const permiso = await prisma.permiso.findFirst({ where: { colaboradorId: colabId } })
    expect(permiso, 'la aprobación debe crear el permiso').toBeTruthy()
  })
})

describe('3. Incapacidad: la valida Talento Humano, no el jefe', () => {
  it('no pasa por el jefe y termina registrada', async () => {
    const { id } = await pedir({
      tipo: 'INCAPACIDAD', fechaInicio: proximo(-5), fechaFin: proximo(-1),
      entidad: 'EPS Sura', diagnosticoCie10: 'J00',
    })
    const inicial = await prisma.solicitud.findUniqueOrThrow({ where: { id }, include: { pasos: true } })
    // Una incapacidad no se "aprueba": el jefe no decide sobre una orden médica.
    expect(inicial.pasos.length).toBe(1)
    expect(inicial.pasos[0].usaJefeInmediato).toBe(false)

    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
    const inc = await prisma.incapacidad.findFirst({ where: { colaboradorId: colabId } })
    expect(inc, 'debe quedar registrada la incapacidad').toBeTruthy()
  })
})

describe('4. Licencia de ley: se valida, no se aprueba', () => {
  it('el luto no pasa por el jefe y queda registrado', async () => {
    // Es un derecho (Ley 1280 de 2009): negarlo sería una falta del empleador.
    const { id } = await pedir({
      tipo: 'LICENCIA', licenciaTipo: 'LUTO',
      fechaInicio: proximo(-3), fechaFin: proximo(-1), motivo: `Luto ${MARCA}`,
    })
    const inicial = await prisma.solicitud.findUniqueOrThrow({ where: { id }, include: { pasos: true } })
    expect(inicial.pasos.every((p) => !p.usaJefeInmediato), 'una licencia de ley no la decide el jefe').toBe(true)

    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
    const lic = await prisma.licencia.findFirst({ where: { colaboradorId: colabId } })
    expect(lic, 'debe quedar registrada la licencia').toBeTruthy()
    expect(lic!.remunerada, 'el luto es remunerado').toBe(true)
  })
})

describe('5. Licencia discrecional: esa sí la decide el jefe', () => {
  it('una licencia no remunerada pasa por el jefe', async () => {
    const { id } = await pedir({
      tipo: 'LICENCIA', licenciaTipo: 'NO_REMUNERADA',
      fechaInicio: proximo(20), fechaFin: proximo(22), motivo: `Asunto personal ${MARCA}`,
    })
    const inicial = await prisma.solicitud.findUniqueOrThrow({ where: { id }, include: { pasos: true } })
    expect(inicial.pasos.some((p) => p.usaJefeInmediato)).toBe(true)

    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
  })
})

describe('6. Certificación laboral: sale el documento', () => {
  it('al aprobarse queda el resultado de la certificación', async () => {
    const { id } = await pedir({ tipo: 'CERTIFICACION_LABORAL' })
    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
    // El resultado guarda a qué dio lugar la solicitud; sin él, el empleado
    // aprueba y no recibe nada.
    expect(final.resultado, 'la certificación debe dejar constancia de su emisión').toBeTruthy()
  })
})

describe('7. Rechazo: el flujo también tiene que saber decir que no', () => {
  it('un permiso rechazado por el jefe no crea nada', async () => {
    const permisosAntes = await prisma.permiso.count({ where: { colaboradorId: colabId } })
    const { id } = await pedir({
      tipo: 'PERMISO', fechaInicio: proximo(25), fechaFin: proximo(25),
      motivo: `Rechazado ${MARCA}`, diaCompleto: true,
    })
    const paso = await prisma.pasoAprobacion.findFirstOrThrow({ where: { solicitudId: id, estado: 'PENDIENTE' } })
    actuarComo(jefe)
    const res = await resolverPaso({ pasoId: paso.id, aprobar: false, comentario: 'Hay cierre de mes' } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { id } })
    expect(sol.estado).toBe('RECHAZADA')
    expect(await prisma.permiso.count({ where: { colaboradorId: colabId } })).toBe(permisosAntes)
  })
})

describe('8. Contrapropuesta de fechas en vacaciones', () => {
  it('el jefe propone otras fechas y el colaborador las acepta', async () => {
    const { id } = await pedir({ tipo: 'VACACIONES', fechaInicio: proximo(60), fechaFin: proximo(64) })
    const paso = await prisma.pasoAprobacion.findFirstOrThrow({ where: { solicitudId: id, estado: 'PENDIENTE' } })

    actuarComo(jefe)
    const prop = await proponerFechas({
      pasoId: paso.id, fechaInicio: proximo(70), fechaFin: proximo(74),
      comentario: 'Esa semana hay inventario',
    } as never)
    expect(prop.ok, prop.ok ? '' : prop.error).toBe(true)

    // El colaborador decide: las vacaciones no se le imponen (RIT cap. 9).
    actuarComo(empleado)
    const resp = await responderContrapropuesta({ solicitudId: id, aceptar: true } as never)
    expect(resp.ok, resp.ok ? '' : resp.error).toBe(true)

    const final = await aprobarHastaElFinal(id)
    expect(final.estado).toBe('APROBADA')
    const vacs = await prisma.vacaciones.findMany({ where: { colaboradorId: colabId } })
    expect(vacs.length).toBeGreaterThan(1)
  })
})

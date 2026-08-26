import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

// Debe instalarse ANTES de importar las acciones: los mocks se aplican al
// resolver el módulo, no al ejecutarlo.
instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { crearSolicitud, cancelarSolicitud, actualizarMiFicha, resolverPaso } = await import('@/app/(app)/autoservicio/acciones')
const { crearMiCuentaCobro } = await import('@/app/(app)/autoservicio/cuentas-acciones')
const { crearMiDenuncia, consultarMiDenuncia, crearMiConsultaReclamo } = await import('@/app/(app)/autoservicio/juridica-acciones')
const { liquidar } = await import('@/app/(app)/nomina/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * El autoservicio del empleado, ejecutando las Server Actions REALES.
 *
 * Es la diferencia con las demás pruebas: aquí no se llama a la función de
 * cálculo sino a la acción que pulsa el empleado, con su rol y sus permisos.
 * Así se comprueba lo que de verdad puede hacer —y lo que el sistema debe
 * negarle— en vez de confiar en que la pantalla se lo esconda.
 */

const MARCA = 'PRUEBA-EMPLEADO'
/** Fechas futuras, porque no se piden vacaciones para ayer. */
const proximo = (dias: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

let empleado: UsuarioSesion
let jefe: UsuarioSesion
let contratista: UsuarioSesion
let empleadoColabId: string

/** Sesión real de un usuario ya existente en la base, con sus permisos. */
async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { rol: { include: { permisos: true } } },
  })
  const colab = await prisma.colaborador.findFirst({ where: { usuarioId: u.id }, select: { id: true } })
  return {
    id: u.id, email: u.email, nombre: u.name,
    rolId: u.rolId!, rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre],
    estado: u.estado, debeCambiarPassword: false,
    colaboradorId: colab?.id ?? null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({
      modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never,
    })),
  }
}

async function limpiar() {
  const ids = (await prisma.colaborador.findMany({ where: { apellidos: MARCA }, select: { id: true } })).map((c) => c.id)
  const todos = [...ids, empleadoColabId].filter(Boolean)
  if (todos.length) {
    const sols = await prisma.solicitud.findMany({ where: { colaboradorId: { in: todos } }, select: { id: true } })
    await prisma.pasoAprobacion.deleteMany({ where: { solicitudId: { in: sols.map((s) => s.id) } } })
    await prisma.solicitud.deleteMany({ where: { colaboradorId: { in: todos } } })
  }
  await prisma.denunciaAcoso.deleteMany({ where: { hechos: { contains: MARCA } } })
  await prisma.consultaReclamoDatos.deleteMany({ where: { descripcion: { contains: MARCA } } })
}

beforeAll(async () => {
  empleado = await sesionDe('yeison.cordoba@prueba.local')
  jefe = await sesionDe('diego.benavides@prueba.local')
  contratista = await sesionDe('oscar.delgado@prueba.local')
  empleadoColabId = empleado.colaboradorId!
  await limpiar()
})

afterAll(async () => { await limpiar(); await prisma.$disconnect() })

describe('lo que el empleado SÍ puede hacer', () => {
  it('pide vacaciones y le quedan en aprobación', async () => {
    actuarComo(empleado)
    const res = await crearSolicitud({
      tipo: 'VACACIONES', fechaInicio: proximo(30), fechaFin: proximo(36),
    } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)

    const sol = await prisma.solicitud.findFirstOrThrow({
      where: { colaboradorId: empleadoColabId, tipo: 'VACACIONES' },
      include: { pasos: true },
    })
    expect(sol.estado).toBe('EN_APROBACION')
    // Su jefe inmediato tiene que quedar como aprobador: si no, la solicitud
    // se queda sin dueño y nadie la ve.
    expect(sol.pasos.length).toBeGreaterThan(0)
  })

  it('pide un permiso', async () => {
    actuarComo(empleado)
    const res = await crearSolicitud({
      tipo: 'PERMISO', fechaInicio: proximo(10), fechaFin: proximo(10),
      motivo: `Cita médica ${MARCA}`, diaCompleto: true,
    } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
  })

  it('pide su certificación laboral', async () => {
    actuarComo(empleado)
    const res = await crearSolicitud({ tipo: 'CERTIFICACION_LABORAL' } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
  })

  it('completa sus propios datos', async () => {
    actuarComo(empleado)
    const res = await actualizarMiFicha({ direccion: `Calle ${MARCA}`, lugarNacimiento: 'Pasto' } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
    const c = await prisma.colaborador.findUniqueOrThrow({ where: { id: empleadoColabId } })
    expect(c.direccion).toContain(MARCA)
  })

  it('NO puede cambiarse el celular desde su autoservicio', async () => {
    // El esquema de autoservicio no incluye celular ni correo: son el canal por
    // el que llegan las credenciales, así que los cambia Talento Humano. Un
    // cambio silencioso ahí desviaría los avisos de acceso a otro teléfono.
    actuarComo(empleado)
    const antes = await prisma.colaborador.findUniqueOrThrow({ where: { id: empleadoColabId } })
    await actualizarMiFicha({ celular: '3181234567', direccion: 'Otra dirección' } as never)
    const despues = await prisma.colaborador.findUniqueOrThrow({ where: { id: empleadoColabId } })
    expect(despues.celular).toBe(antes.celular)
  })

  it('reporta por la línea ética y consulta con su código', async () => {
    actuarComo(empleado)
    const res = await crearMiDenuncia({
      tipo: 'CONDUCTA_IRREGULAR', anonima: true, hechos: `Hechos de ${MARCA} para probar el canal`,
    } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
    const { codigo } = (res.ok ? res.datos : { codigo: '' }) as { codigo: string }

    const consulta = await consultarMiDenuncia({ codigo } as never)
    expect(consulta.ok).toBe(true)
    // El seguimiento devuelve el estado, nunca los hechos ni quién denunció.
    expect(JSON.stringify(consulta.ok ? consulta.datos : {})).not.toContain(MARCA)
  })

  it('radica una solicitud de habeas data', async () => {
    actuarComo(empleado)
    const res = await crearMiConsultaReclamo({ tipo: 'CONSULTA', descripcion: `Consulta ${MARCA}` } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
  })

  it('cancela una solicitud suya', async () => {
    actuarComo(empleado)
    const sol = await prisma.solicitud.findFirstOrThrow({
      where: { colaboradorId: empleadoColabId, tipo: 'PERMISO', estado: 'EN_APROBACION' },
    })
    const res = await cancelarSolicitud({ id: sol.id } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
  })
})

describe('lo que el empleado NO puede hacer', () => {
  it('no puede liquidar la nómina', async () => {
    actuarComo(empleado)
    const periodo = await prisma.periodoNomina.findFirst()
    if (!periodo) return
    const res = await liquidar({ periodoId: periodo.id } as never)
    expect(res.ok).toBe(false)
    expect(res.ok ? '' : res.error).toContain('permiso')
  })

  it('no puede aprobar su propia solicitud', async () => {
    actuarComo(empleado)
    const sol = await prisma.solicitud.findFirstOrThrow({
      where: { colaboradorId: empleadoColabId, tipo: 'VACACIONES' },
      include: { pasos: true },
    })
    const paso = sol.pasos[0]
    if (!paso) return
    const res = await resolverPaso({ pasoId: paso.id, aprobar: true } as never)
    // Aprobarse a sí mismo rompe todo el control: debe negarse.
    expect(res.ok).toBe(false)
  })

  it('sin sesión no puede hacer nada', async () => {
    actuarComo(null)
    const res = await crearSolicitud({ tipo: 'CERTIFICACION_LABORAL' } as never)
    expect(res.ok).toBe(false)
  })
})

describe('el jefe inmediato resuelve lo de su equipo', () => {
  it('aprueba las vacaciones que pidió su colaborador', async () => {
    const sol = await prisma.solicitud.findFirstOrThrow({
      where: { colaboradorId: empleadoColabId, tipo: 'VACACIONES' },
      include: { pasos: true },
    })
    const paso = sol.pasos.find((p) => p.estado === 'PENDIENTE')
    if (!paso) return
    actuarComo(jefe)
    const res = await resolverPaso({ pasoId: paso.id, aprobar: true } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
  })
})

describe('el contratista OPS tiene otro autoservicio', () => {
  it('no puede pedir vacaciones', async () => {
    actuarComo(contratista)
    const res = await crearSolicitud({
      tipo: 'VACACIONES', fechaInicio: proximo(30), fechaFin: proximo(35),
    } as never)
    // Ofrecerle vacaciones a un contratista es prueba de subordinación.
    expect(res.ok).toBe(false)
  })

  it('sí puede radicar su cuenta de cobro', async () => {
    actuarComo(contratista)
    const res = await crearMiCuentaCobro({
      periodo: '2026-05', valor: 2_000_000, concepto: `Honorarios ${MARCA}`,
    } as never)
    expect(res.ok, res.ok ? '' : res.error).toBe(true)
    const cuenta = await prisma.cuentaCobroOps.findFirst({
      where: { colaboradorId: contratista.colaboradorId!, periodo: '2026-05' },
    })
    expect(cuenta?.estado).toBe('RADICADA')
    if (cuenta) {
      await prisma.soporteSsOps.deleteMany({ where: { cuentaCobroId: cuenta.id } })
      await prisma.cuentaCobroOps.delete({ where: { id: cuenta.id } })
    }
  })
})

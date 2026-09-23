import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

/**
 * Pago aparte de horas extra ↔ AsistencIA: al quedar la orden firmada (o al
 * marcar el pago, si aquello falló) se CIERRA allá el período de esa persona;
 * y el aviso de prueba "lo que marcaste hoy" le llega al colaborador con sus
 * tramos del día. AsistencIA se simula: aquí se prueba lo de esta plataforma.
 */
const simulado = vi.hoisted(() => ({
  hoy: [] as unknown[],
  cierres: [] as { desde: string; hasta: string; documentos: string[] }[],
  /** Cómo responde AsistencIA al cierre: la cédula va en esta lista. */
  respuesta: 'cerrados' as 'cerrados' | 'yaCerrados' | 'sinExtras' | 'caida',
}))
vi.mock('@/server/asistencia/cliente', async (original) => {
  const real = await original<typeof import('@/server/asistencia/cliente')>()
  return {
    ...real,
    conexionAsistencia: async () => ({ url: 'https://asistencia.prueba.local', clave: 'clave-de-prueba' }),
    tramosAsistencia: async () => simulado.hoy,
    cerrarEnAsistencia: async (periodo: { desde: string; hasta: string }, documentos: string[]) => {
      if (simulado.respuesta === 'caida') throw new real.ErrorAsistencia('AsistencIA no responde.', 'NO_RESPONDE')
      simulado.cierres.push({ ...periodo, documentos })
      return { ...periodo, cerrados: [], yaCerrados: [], sinExtras: [], [simulado.respuesta]: documentos }
    },
  }
})

const { prisma } = await import('@/lib/db')
const { cerrarPagoPersonaEnAsistencia } = await import('@/server/asistencia/pagos-asistencia')
const { marcarPagoHorasExtraPagado } = await import('@/server/pago-horas-extra')
const { verResumenHoy } = await import('@/app/(app)/nomina/novedades/asistencia-acciones')
const { hoyBogotaISO } = await import('@/lib/fechas')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

let colab: { id: string; cedula: string; usuarioId: string }
let admin: UsuarioSesion
const pagosCreados: string[] = []

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { rol: { include: { permisos: true } } } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!, rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre],
    estado: u.estado, debeCambiarPassword: false, colaboradorId: null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({ modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never })),
  }
}

beforeAll(async () => {
  const c = await prisma.colaborador.findFirstOrThrow({
    where: { estado: 'ACTIVO', usuarioId: { not: null }, contratos: { some: { estado: 'ACTIVO' } } },
    select: { id: true, numeroDocumento: true, usuarioId: true },
  })
  colab = { id: c.id, cedula: c.numeroDocumento.replace(/[.\s-]/g, ''), usuarioId: c.usuarioId! }
  admin = await sesionDe('ricardo.pena@prueba.local')
})

afterAll(async () => {
  await prisma.pagoHorasExtra.deleteMany({ where: { id: { in: pagosCreados } } })
  await prisma.notificacion.deleteMany({ where: { userId: colab.usuarioId, evento: 'asistencia_resumen_dia' } })
})

describe('cierre en AsistencIA al pagar aparte', () => {
  const pago = { colaboradorId: '', desde: new Date(Date.UTC(2026, 7, 16)), hasta: new Date(Date.UTC(2026, 7, 31)) }

  it('cierra el período exacto de esa persona por cédula sin puntos', async () => {
    simulado.respuesta = 'cerrados'
    simulado.cierres = []
    const r = await cerrarPagoPersonaEnAsistencia({ ...pago, colaboradorId: colab.id })
    expect(r).toEqual({ cerrado: true })
    expect(simulado.cierres).toEqual([{ desde: '2026-08-16', hasta: '2026-08-31', documentos: [colab.cedula] }])
  })

  it('si ya estaba cerrado allá, cuenta como cerrado; si la cédula no existe o AsistencIA no responde, devuelve el error sin romper', async () => {
    simulado.respuesta = 'yaCerrados'
    expect(await cerrarPagoPersonaEnAsistencia({ ...pago, colaboradorId: colab.id })).toEqual({ cerrado: true })
    simulado.respuesta = 'sinExtras'
    expect((await cerrarPagoPersonaEnAsistencia({ ...pago, colaboradorId: colab.id })).cerrado).toBe(false)
    simulado.respuesta = 'caida'
    const caida = await cerrarPagoPersonaEnAsistencia({ ...pago, colaboradorId: colab.id })
    expect(caida.cerrado).toBe(false)
    expect(caida.error).toContain('no responde')
  })

  it('al marcar el pago de una orden firmada que no se pudo cerrar al firmar, se reintenta y queda anotado', async () => {
    const fila = await prisma.pagoHorasExtra.create({
      data: {
        colaboradorId: colab.id, desde: new Date(Date.UTC(2026, 6, 1)), hasta: new Date(Date.UTC(2026, 6, 15)),
        horasExtra: 3, valor: 45000, detalleHoras: { HED: 3 }, estado: 'FIRMADA', firmaFecha: new Date(),
      },
    })
    pagosCreados.push(fila.id)
    simulado.respuesta = 'cerrados'
    simulado.cierres = []
    await marcarPagoHorasExtraPagado({ pagoId: fila.id, usuarioId: admin.id })
    const despues = await prisma.pagoHorasExtra.findUniqueOrThrow({ where: { id: fila.id } })
    expect(despues.estado).toBe('PAGADO')
    expect(despues.asistenciaAnotadoEn).not.toBeNull()
    expect(simulado.cierres).toEqual([{ desde: '2026-07-01', hasta: '2026-07-15', documentos: [colab.cedula] }])
  })

  it('si ya quedó anotado al firmar, marcar el pago no vuelve a cerrar', async () => {
    const fila = await prisma.pagoHorasExtra.create({
      data: {
        colaboradorId: colab.id, desde: new Date(Date.UTC(2026, 5, 1)), hasta: new Date(Date.UTC(2026, 5, 15)),
        horasExtra: 1, valor: 15000, estado: 'FIRMADA', firmaFecha: new Date(), asistenciaAnotadoEn: new Date(),
      },
    })
    pagosCreados.push(fila.id)
    simulado.cierres = []
    await marcarPagoHorasExtraPagado({ pagoId: fila.id, usuarioId: admin.id })
    expect(simulado.cierres).toEqual([])
  })
})

describe('reporte del día: lo que AsistencIA registró hoy', () => {
  it('trae los tramos de hoy de esa persona (y no los de otra cédula), sin avisarle a nadie', async () => {
    const hoy = hoyBogotaISO()
    simulado.hoy = [
      { documento: colab.cedula, fecha: hoy, horaInicio: '18:00', horaFin: '20:00', tipoHora: 'HED', horas: 2, referenciaExterna: 'a' },
      { documento: '999999999', fecha: hoy, horaInicio: '18:00', horaFin: '23:00', tipoHora: 'HEN', horas: 5, referenciaExterna: 'b' },
    ]
    actuarComo(admin)
    const res = await verResumenHoy({ colaboradorId: colab.id })
    if (!res.ok) throw new Error(res.error)
    expect(res.datos.tramos).toHaveLength(1)
    expect(res.datos.tramos[0]).toMatchObject({ horaInicio: '18:00', horaFin: '20:00', tipoHora: 'HED', horas: 2 })
    expect(res.datos.totalHoras).toBe(2)
    expect(res.datos.mensaje).toContain('18:00–20:00 extra diurna (2 h). Total: 2 h.')
    // Mientras las horas extra están en prueba, al colaborador NO le llega nada.
    const notif = await prisma.notificacion.findFirst({ where: { userId: colab.usuarioId, evento: 'asistencia_resumen_dia' } })
    expect(notif).toBeNull()
  })

  it('sin tramos hoy, el reporte lo dice y sigue sin avisar a nadie', async () => {
    simulado.hoy = []
    actuarComo(admin)
    const res = await verResumenHoy({ colaboradorId: colab.id })
    if (!res.ok) throw new Error(res.error)
    expect(res.datos.tramos).toHaveLength(0)
    expect(res.datos.totalHoras).toBe(0)
    expect(res.datos.mensaje).toContain('no tienes horas extra ni recargos registrados')
    expect(await prisma.notificacion.count({ where: { userId: colab.usuarioId, evento: 'asistencia_resumen_dia' } })).toBe(0)
  })

  it('el envío al colaborador sigue existiendo, listo para cuando salga de pruebas', async () => {
    const { enviarResumenDiaAsistencia } = await import('@/server/asistencia/resumen-dia')
    simulado.hoy = [{ documento: colab.cedula, fecha: hoyBogotaISO(), horaInicio: '19:00', horaFin: '21:00', tipoHora: 'HEN', horas: 2, referenciaExterna: 'c' }]
    const r = await enviarResumenDiaAsistencia(colab.id)
    expect(r.tramos).toBe(1)
    const notif = await prisma.notificacion.findFirst({ where: { userId: colab.usuarioId, evento: 'asistencia_resumen_dia' }, orderBy: { creadoEn: 'desc' } })
    expect(notif?.titulo).toBe('Tu registro de hoy en AsistencIA')
    expect(notif?.enlace).toBe('/autoservicio/horas-extra')
  })
})

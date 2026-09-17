import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

/**
 * AsistencIA simulada: se controla qué tramos y qué resumen devuelve, y se
 * anota qué referencias se marcaron como pagadas. El cruce por cédula, el
 * corte diurno/nocturno y la idempotencia son de esta plataforma y son lo que
 * se prueba aquí contra la base.
 */
const simulado = vi.hoisted(() => ({
  tramos: [] as unknown[],
  empleados: [] as unknown[],
  pagadas: [] as { referencias: string[]; pagado: boolean }[],
}))
vi.mock('@/server/asistencia/cliente', async (original) => {
  const real = await original<typeof import('@/server/asistencia/cliente')>()
  return {
    ...real,
    conexionAsistencia: async () => ({ url: 'https://asistencia.prueba.local', clave: 'clave-de-prueba' }),
    tramosAsistencia: async () => simulado.tramos,
    resumenAsistencia: async () => ({
      desde: '2026-09-01', hasta: '2026-09-15',
      totales: { empleados: simulado.empleados.length, horas: {}, horasExtra: 0, valor: 0, valorPendiente: 0, sinSalario: 0 },
      empleados: simulado.empleados,
    }),
    anotarPagadas: async (referencias: string[], pagado = true) => {
      simulado.pagadas.push({ referencias, pagado })
      return { afectados: referencias.length }
    },
  }
})

const { prisma } = await import('@/lib/db')
const { sincronizarHorasAsistencia, novedadesDesdeTramos } = await import('@/server/asistencia/horas-asistencia')
const { anotarPagoPeriodoEnAsistencia } = await import('@/server/asistencia/pagos-asistencia')
const { consultarHorasAsistencia } = await import('@/app/(app)/nomina/novedades/asistencia-acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

const MARCA = 'PRUEBA-ASIST'
const RANGO = { desde: '2026-09-01', hasta: '2026-09-15' }
let colab: { id: string; cedula: string; nombre: string }
let periodoId: string
let admin: UsuarioSesion

const tramo = (cedula: string, fecha: string, ini: string, fin: string, tipo: string, horas: number) => ({
  documento: cedula, nombre: 'Quien sea', sede: 'Principal', fecha, horaInicio: ini, horaFin: fin, tipoHora: tipo, horas,
  referenciaExterna: `arrive-${cedula}-${fecha.replaceAll('-', '')}-${ini.replace(':', '')}-${fin.replace(':', '')}-${tipo}`,
  observaciones: MARCA, factor: 1.25, valor: 10000, pagado: false,
})

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { rol: { include: { permisos: true } } } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!, rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre],
    estado: u.estado, debeCambiarPassword: false, colaboradorId: null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({ modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never })),
  }
}

beforeAll(async () => {
  const c = await prisma.colaborador.findFirstOrThrow({ where: { estado: 'ACTIVO', contratos: { some: { estado: 'ACTIVO' } } }, select: { id: true, numeroDocumento: true, nombres: true, apellidos: true } })
  colab = { id: c.id, cedula: c.numeroDocumento.replace(/[.\s-]/g, ''), nombre: `${c.nombres} ${c.apellidos}` }
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conNomina = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'nomina' && p.accion === 'CREAR'))
  if (!conNomina) throw new Error('No hay usuario con nomina:CREAR')
  admin = await sesionDe(conNomina.email)
  const p = await prisma.periodoNomina.create({
    data: {
      nombre: `${MARCA} sep 2026 q1`, tipo: 'QUINCENAL', anio: 2026, mes: 9, quincena: 1,
      fechaInicio: new Date(Date.UTC(2026, 8, 1)), fechaFin: new Date(Date.UTC(2026, 8, 15)), diasPeriodo: 15, estado: 'BORRADOR',
    },
  })
  periodoId = p.id
})

afterAll(async () => {
  await prisma.novedadHoras.deleteMany({ where: { observaciones: MARCA } })
  await prisma.novedadHoras.deleteMany({ where: { periodoId } })
  await prisma.periodoNomina.delete({ where: { id: periodoId } }).catch(() => {})
})

describe('AsistencIA → novedades de horas', () => {
  it('cruza por cédula (sin puntos), traduce HEDDF/HENDF a HEDD/HEND y parte el tramo en las 7 p.m.', async () => {
    const { novedades, sinColaborador } = await novedadesDesdeTramos([
      // Con puntos, como podría venir de una ficha vieja: cruza igual.
      tramo(colab.cedula.replace(/(\d)(?=(\d{3})+$)/g, '$1.'), '2026-09-07', '17:00', '21:00', 'HED', 4),
      tramo(colab.cedula, '2026-09-06', '08:00', '10:00', 'HEDDF', 2),
      tramo('999999999', '2026-09-07', '18:00', '19:00', 'HED', 1),
    ] as never)
    expect(sinColaborador).toEqual([{ documento: '999999999', nombre: 'Quien sea' }])
    const tipos = novedades.map((n) => `${n.tipoHora}:${n.horas}`).sort()
    // 17–21 = 2 h diurnas + 2 h nocturnas; el dominical diurno queda como HEDD.
    expect(tipos).toEqual(['HED:2', 'HEDD:2', 'HEN:2'])
    expect(novedades.every((n) => n.colaboradorId === colab.id)).toBe(true)
  })

  it('traer es idempotente: la segunda vez no crea nada, y una marcación corregida retira el tramo viejo', async () => {
    simulado.tramos = [tramo(colab.cedula, '2026-09-02', '18:00', '20:00', 'HED', 2), tramo(colab.cedula, '2026-09-03', '18:00', '19:00', 'HED', 1)]
    const primera = await sincronizarHorasAsistencia(RANGO)
    expect(primera).toMatchObject({ creadas: 3, yaEstaban: 0, quitadas: 0 })
    const segunda = await sincronizarHorasAsistencia(RANGO)
    expect(segunda).toMatchObject({ creadas: 0, yaEstaban: 3, quitadas: 0 })

    // En AsistencIA corrigen la marcación del día 3: el tramo cambia de referencia.
    simulado.tramos = [simulado.tramos[0], tramo(colab.cedula, '2026-09-03', '18:00', '19:30', 'HED', 1.5)]
    const tercera = await sincronizarHorasAsistencia(RANGO)
    expect(tercera).toMatchObject({ creadas: 2, yaEstaban: 2, quitadas: 1 })
    const registradas = await prisma.novedadHoras.findMany({ where: { observaciones: MARCA }, select: { referenciaExterna: true, tipoHora: true, horas: true } })
    expect(registradas).toHaveLength(4)
  })

  it('la consulta del período dice cuántos tramos ya están en la nómina y qué cédulas no tienen ficha', async () => {
    actuarComo(admin)
    simulado.empleados = [
      { documento: colab.cedula, nombre: 'Nombre allá', sede: 'Principal', horas: { HED: 2, HEN: 1.5, HEDDF: 0, HENDF: 0 }, horasExtra: 3.5, valor: 50000, sinSalario: false,
        referencias: simulado.tramos.map((t) => (t as { referenciaExterna: string }).referenciaExterna), referenciasPendientes: [], pago: 'pendiente' },
      { documento: '999999999', nombre: 'Sin Ficha', sede: null, horas: { HED: 1, HEN: 0, HEDDF: 0, HENDF: 0 }, horasExtra: 1, valor: null, sinSalario: true, referencias: ['arrive-999999999-x'], referenciasPendientes: ['arrive-999999999-x'], pago: 'pendiente' },
    ]
    const res = await consultarHorasAsistencia({ mes: '2026-09', quincena: 1 })
    if (!res.ok) throw new Error(res.error)
    const mia = res.datos.filas.find((f) => f.documento === colab.cedula)!
    expect(mia.nombre).toBe(colab.nombre) // el nombre manda el de aquí, no el de allá
    expect(mia.colaboradorId).toBe(colab.id)
    expect(mia).toMatchObject({ tramos: 2, registrados: 2 })
    const ajena = res.datos.filas.find((f) => f.documento === '999999999')!
    expect(ajena.colaboradorId).toBeNull()
    expect(res.datos.sinFicha).toBe(1)
  })

  it('al cerrar el periodo se anotan como pagadas sus referencias, y al reabrir se desanotan', async () => {
    await prisma.novedadHoras.updateMany({ where: { observaciones: MARCA }, data: { periodoId } })
    const cierre = await anotarPagoPeriodoEnAsistencia(periodoId, true)
    expect(cierre.anotados).toBe(2) // dos tramos (uno partido en HED+HEN comparte referencia)
    expect(simulado.pagadas.at(-1)).toMatchObject({ pagado: true })
    expect(simulado.pagadas.at(-1)!.referencias.sort()).toEqual(simulado.tramos.map((t) => (t as { referenciaExterna: string }).referenciaExterna).sort())

    const reapertura = await anotarPagoPeriodoEnAsistencia(periodoId, false)
    expect(reapertura.anotados).toBe(2)
    expect(simulado.pagadas.at(-1)).toMatchObject({ pagado: false })
  })
})

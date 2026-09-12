import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { asignarEncargadoCumpleanos, entregarFacturasCumpleanos, revisarFacturasCumpleanos, cancelarCelebracionCumpleanos } =
  await import('@/app/(app)/cumpleanos/acciones')
const { cumpleanosEntre, cumpleanosEnAnio, recordarCumpleanosProximos } = await import('@/server/cumpleanos')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Cumpleaños de punta a punta: Talento Humano encarga la celebración, el
 * encargado sube las facturas desde su autoservicio, TH las devuelve o acepta.
 *
 * Se prueba contra la base porque lo que importa son los bordes: quién puede
 * tocar qué (el encargado solo lo suyo), que no se pueda entregar sin facturas,
 * que devolver exija motivo, y que el recordatorio del cron salga una sola vez.
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

// Años lejanos: no chocan con celebraciones reales (única por persona y año).
const ANIO = 2099

let th: UsuarioSesion
let encargado: UsuarioSesion
let otro: UsuarioSesion
let homenajeadoId: string
let fechaNacimiento: Date
/** La fecha de nacimiento que tenía el homenajeado antes (los seeds no la ponen): se restaura al final. */
let fechaNacimientoOriginal: Date | null = null
const creadas: string[] = []

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

/** Una "factura" mínima como Documento, sin pasar por storage. */
async function facturaFalsa(celebracionId: string, nombre = 'Factura torta') {
  return prisma.documento.create({
    data: {
      entidadTipo: 'CelebracionCumpleanos', entidadId: celebracionId, nombre,
      bucket: 'pruebas', storagePath: `pruebas/${celebracionId}/${nombre}.pdf`, mimeType: 'application/pdf',
      tamanoBytes: 1, nivelAcceso: 'GENERAL', subidoPorId: encargado.id,
    },
  })
}

async function asignar(extra: Record<string, unknown> = {}) {
  const res = await asignarEncargadoCumpleanos({ colaboradorId: homenajeadoId, anio: ANIO, encargadoId: encargado.colaboradorId!, nota: 'Torta y decoración', ...extra })
  if (res.ok) creadas.push(res.datos.id)
  return res
}

beforeAll(async () => {
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conBienestar = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'bienestar' && p.accion === 'CREAR'))
  if (!conBienestar) throw new Error('Ningún usuario tiene bienestar:CREAR — ¿corrió la migración bienestar_cumpleanos?')
  th = await sesionDe(conBienestar.email)

  // Dos colaboradores activos con usuario: uno será el encargado y otro "un tercero".
  const conUsuario = await prisma.colaborador.findMany({
    // Con permiso de actuar en autoservicio: es lo que exige entregar las facturas.
    where: { usuarioId: { not: null }, estado: 'ACTIVO', usuario: { estado: 'ACTIVO', rol: { permisos: { some: { modulo: 'autoservicio', accion: 'CREAR' } } } } },
    select: { id: true, usuario: { select: { email: true } } }, take: 2,
  })
  if (conUsuario.length < 2) throw new Error('Hacen falta dos colaboradores activos con usuario en la base local')
  encargado = await sesionDe(conUsuario[0].usuario!.email)
  otro = await sesionDe(conUsuario[1].usuario!.email)

  // El homenajeado: activo y distinto del encargado. Si su ficha no tiene fecha
  // de nacimiento (los seeds no la cargan), se le pone una para la prueba.
  const h = await prisma.colaborador.findFirstOrThrow({
    where: { estado: 'ACTIVO', id: { notIn: [encargado.colaboradorId!, otro.colaboradorId!] } },
    select: { id: true, fechaNacimiento: true },
  })
  homenajeadoId = h.id
  fechaNacimientoOriginal = h.fechaNacimiento
  fechaNacimiento = h.fechaNacimiento ?? new Date(Date.UTC(1990, 5, 15))
  if (!h.fechaNacimiento) await prisma.colaborador.update({ where: { id: h.id }, data: { fechaNacimiento } })
})

afterAll(async () => {
  await prisma.colaborador.update({ where: { id: homenajeadoId }, data: { fechaNacimiento: fechaNacimientoOriginal } })
  await prisma.documento.deleteMany({ where: { entidadTipo: 'CelebracionCumpleanos', entidadId: { in: creadas } } })
  await prisma.celebracionCumpleanos.deleteMany({ where: { id: { in: creadas } } })
  await prisma.notificacion.deleteMany({ where: { evento: { startsWith: 'cumpleanos_' }, titulo: { contains: 'PRUEBA' } } })
})

describe('Cumpleaños', () => {
  it('lista los cumpleaños del rango con la edad, incluso cruzando el cambio de año', async () => {
    const fecha = cumpleanosEnAnio(fechaNacimiento, ANIO)
    const desde = new Date(fecha); desde.setUTCDate(desde.getUTCDate() - 20)
    const hasta = new Date(fecha); hasta.setUTCDate(hasta.getUTCDate() + 20)
    const lista = await cumpleanosEntre(desde, hasta)
    const fila = lista.find((c) => c.colaborador.id === homenajeadoId)
    expect(fila).toBeTruthy()
    expect(fila!.anio).toBe(ANIO)
    expect(fila!.edad).toBe(ANIO - fechaNacimiento.getUTCFullYear())
    // Ordenada por fecha.
    for (let i = 1; i < lista.length; i++) expect(lista[i].fecha.getTime()).toBeGreaterThanOrEqual(lista[i - 1].fecha.getTime())
  })

  it('TH asigna un encargado: queda la celebración y el encargado recibe el aviso', async () => {
    actuarComo(th)
    const { id } = datosDe(await asignar())
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id } })
    expect(c.estado).toBe('ASIGNADA')
    expect(c.encargadoId).toBe(encargado.colaboradorId)
    expect(c.fecha.toISOString().slice(0, 10)).toBe(cumpleanosEnAnio(fechaNacimiento, ANIO).toISOString().slice(0, 10))
    const aviso = await prisma.notificacion.findFirst({ where: { userId: encargado.id, evento: 'cumpleanos_encargado_asignado' }, orderBy: { creadoEn: 'desc' } })
    expect(aviso).toBeTruthy()
  })

  it('nadie organiza su propio cumpleaños', async () => {
    actuarComo(th)
    expect(errorDe(await asignar({ encargadoId: homenajeadoId }))).toContain('propio cumpleaños')
  })

  it('el encargado no puede entregar sin facturas, y un tercero no puede entregar lo ajeno', async () => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { colaboradorId_anio: { colaboradorId: homenajeadoId, anio: ANIO } } })
    actuarComo(encargado)
    expect(errorDe(await entregarFacturasCumpleanos({ id: c.id, valorTotal: 80_000 }))).toContain('al menos una factura')
    await facturaFalsa(c.id)
    actuarComo(otro)
    expect(errorDe(await entregarFacturasCumpleanos({ id: c.id }))).toContain('no está a tu cargo')
  })

  it('entregar → devolver con motivo → volver a entregar → aceptar', async () => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { colaboradorId_anio: { colaboradorId: homenajeadoId, anio: ANIO } } })

    actuarComo(encargado)
    datosDe(await entregarFacturasCumpleanos({ id: c.id, valorTotal: 80_000 }))
    let ahora = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: c.id } })
    expect(ahora.estado).toBe('FACTURAS_ENTREGADAS')
    expect(Number(ahora.valorReportado)).toBe(80_000)
    expect(ahora.facturasEntregadasEn).toBeTruthy()

    // Con facturas entregadas, TH no cambia el encargado a la ligera.
    actuarComo(th)
    expect(errorDe(await asignar({ encargadoId: otro.colaboradorId! }))).toContain('ya entregó las facturas')

    // Devolver exige decir por qué.
    expect(errorDe(await revisarFacturasCumpleanos({ id: c.id, decision: 'DEVOLVER', motivo: '' }))).toBeTruthy()
    datosDe(await revisarFacturasCumpleanos({ id: c.id, decision: 'DEVOLVER', motivo: 'Falta la factura de la torta' }))
    ahora = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: c.id } })
    expect(ahora.estado).toBe('ASIGNADA')
    expect(ahora.motivoDevolucion).toContain('torta')
    const devuelto = await prisma.notificacion.findFirst({ where: { userId: encargado.id, evento: 'cumpleanos_facturas_revisadas' }, orderBy: { creadoEn: 'desc' } })
    expect(devuelto?.titulo).toContain('devueltas')

    // Vuelve a entregar (con otra factura) y TH acepta.
    actuarComo(encargado)
    await facturaFalsa(c.id, 'Factura decoración')
    datosDe(await entregarFacturasCumpleanos({ id: c.id, valorTotal: 95_000 }))
    actuarComo(th)
    datosDe(await revisarFacturasCumpleanos({ id: c.id, decision: 'ACEPTAR' }))
    ahora = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: c.id } })
    expect(ahora.estado).toBe('CERRADA')
    expect(ahora.cerradaPorId).toBe(th.id)
    expect(ahora.motivoDevolucion).toBeNull()

    // Cerrada: no se reasigna ni se vuelve a entregar.
    expect(errorDe(await asignar({ encargadoId: otro.colaboradorId! }))).toContain('se cerró')
    actuarComo(encargado)
    expect(errorDe(await entregarFacturasCumpleanos({ id: c.id }))).toContain('ya cerró')
  })

  it('cancelar solo antes de que haya facturas', async () => {
    actuarComo(th)
    const { id } = datosDe(await asignar({ anio: ANIO - 1 }))
    datosDe(await cancelarCelebracionCumpleanos({ id }))
    expect(await prisma.celebracionCumpleanos.findUnique({ where: { id } })).toBeNull()

    const { id: id2 } = datosDe(await asignar({ anio: ANIO - 2 }))
    await facturaFalsa(id2)
    expect(errorDe(await cancelarCelebracionCumpleanos({ id: id2 }))).toContain('ya subió archivos')
  })

  it('el recordatorio sale una sola vez cuando el cumpleaños está cerca', async () => {
    // Se crea directo con la fecha a dos días, que es lo que mira el cron.
    const fecha = new Date(); fecha.setUTCHours(0, 0, 0, 0); fecha.setUTCDate(fecha.getUTCDate() + 2)
    const c = await prisma.celebracionCumpleanos.create({
      data: { colaboradorId: homenajeadoId, anio: ANIO - 3, fecha, encargadoId: encargado.colaboradorId!, asignadaPorId: th.id, nota: 'PRUEBA' },
    })
    creadas.push(c.id)
    const antes = await prisma.notificacion.count({ where: { userId: encargado.id, evento: 'cumpleanos_recordatorio' } })
    const r1 = await recordarCumpleanosProximos()
    expect(r1.recordados).toBeGreaterThanOrEqual(1)
    expect(await prisma.notificacion.count({ where: { userId: encargado.id, evento: 'cumpleanos_recordatorio' } })).toBe(antes + 1)
    expect((await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: c.id } })).recordatorioEnviadoEn).toBeTruthy()
    // Segunda corrida: nada nuevo para esta celebración.
    await recordarCumpleanosProximos()
    expect(await prisma.notificacion.count({ where: { userId: encargado.id, evento: 'cumpleanos_recordatorio' } })).toBe(antes + 1)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { crearAviso, publicarAviso, marcarAvisoLeido, reavisar, lecturasDeAviso } = await import('@/app/(app)/avisos/acciones')
const { avisosParaUsuario, usuariosDeAudiencia } = await import('@/server/avisos')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Avisos de la plataforma, contra la base: quién puede publicar, a quién le
 * llega según la audiencia (rol / vínculo), la notificación al publicar, el
 * "Entendido" y el reenvío solo a quienes no han leído.
 */

const MARCA = 'PRUEBA-AVISO'
let admin: UsuarioSesion
let empleado: UsuarioSesion
let contratista: UsuarioSesion
const creados: string[] = []

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { rol: { include: { permisos: true } }, colaborador: { select: { id: true } } } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!, rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre],
    estado: u.estado, debeCambiarPassword: false, colaboradorId: u.colaborador?.id ?? null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({ modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never })),
  }
}

beforeAll(async () => {
  admin = await sesionDe('ricardo.pena@prueba.local')
  empleado = await sesionDe('yeison.cordoba@prueba.local')
  contratista = await sesionDe('oscar.delgado@prueba.local')
})

afterAll(async () => {
  await prisma.notificacion.deleteMany({ where: { evento: 'aviso_publicado', titulo: { contains: MARCA } } })
  await prisma.aviso.deleteMany({ where: { id: { in: creados } } })
})

describe('avisos de la plataforma', () => {
  it('un empleado no puede crear avisos', async () => {
    actuarComo(empleado)
    const res = await crearAviso({ titulo: `${MARCA} no`, resumen: 'x', detalle: '', tipo: 'MEJORA', enlace: '', vigenteHasta: '', audiencia: { roles: [], vinculos: [], sedeIds: [] } })
    expect(res.ok).toBe(false)
  })

  it('el administrador lo crea como borrador y al publicarlo notifica solo a la audiencia (vínculo laboral)', async () => {
    actuarComo(admin)
    const creado = await crearAviso({
      titulo: `${MARCA} Mis entregas`, resumen: 'Ya puedes firmar tus entregas desde el celular.', detalle: '- Entra a Mis entregas\n- Toca Firmar',
      tipo: 'NUEVO_MODULO', enlace: '/autoservicio/dotacion', vigenteHasta: '', audiencia: { roles: [], vinculos: ['LABORAL'], sedeIds: [] },
    })
    if (!creado.ok) throw new Error(creado.error)
    creados.push(creado.datos.id)

    // En borrador nadie lo ve.
    expect((await avisosParaUsuario(empleado)).some((a) => a.id === creado.datos.id)).toBe(false)

    const pub = await publicarAviso({ id: creado.datos.id })
    if (!pub.ok) throw new Error(pub.error)
    const audiencia = await usuariosDeAudiencia({ vinculos: ['LABORAL'] })
    expect(pub.datos.notificados).toBe(audiencia.length)
    expect(audiencia.some((u) => u.id === empleado.id)).toBe(true)
    expect(audiencia.some((u) => u.id === contratista.id)).toBe(false)

    // Le llega al empleado (sin leer) y no al contratista OPS.
    const delEmpleado = (await avisosParaUsuario(empleado)).find((a) => a.id === creado.datos.id)
    expect(delEmpleado).toMatchObject({ leido: false, vigente: true })
    expect((await avisosParaUsuario(contratista)).some((a) => a.id === creado.datos.id)).toBe(false)
    const notif = await prisma.notificacion.findFirst({ where: { userId: empleado.id, evento: 'aviso_publicado', titulo: { contains: MARCA } } })
    expect(notif?.enlace).toBe(`/avisos?ver=${creado.datos.id}`)
  })

  it('«Entendido» lo marca como leído, y re-avisar solo va a quienes no lo han leído', async () => {
    const id = creados[creados.length - 1]
    actuarComo(empleado)
    const ok = await marcarAvisoLeido({ id })
    expect(ok.ok).toBe(true)
    expect((await avisosParaUsuario(empleado)).find((a) => a.id === id)?.leido).toBe(true)

    actuarComo(admin)
    const lect = await lecturasDeAviso({ id })
    if (!lect.ok) throw new Error(lect.error)
    expect(lect.datos.leidos).toContain(empleado.nombre)
    const re = await reavisar({ id })
    if (!re.ok) throw new Error(re.error)
    expect(re.datos.notificados).toBe(lect.datos.total - lect.datos.leidos.length)
  })
})

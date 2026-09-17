import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()
// El correo no sale de verdad: se anota a quién iba y con qué asunto.
vi.mock('@/server/notificaciones/correo', () => ({ enviarCorreo: vi.fn(async () => {}) }))

const { prisma } = await import('@/lib/db')
const { enviarCorreo } = await import('@/server/notificaciones/correo')
const { eliminarArchivo } = await import('@/server/storage')
const { subirAcuerdoConToken } = await import('@/app/firmar-acuerdo/[token]/acciones')
const { decidirAcuerdo } = await import('@/app/(app)/contratos/acuerdos/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Avisos de la evaluación previa. Se prueban contra la base porque lo que
 * importa es a quién le llega qué: cuando el aspirante devuelve el acuerdo
 * firmado por el enlace público, tiene que enterarse quien envió el enlace y
 * también Talento Humano (antes era un solo correo a quien lo envió); y al
 * decidir, el aspirante —que no es usuario— recibe la decisión por correo.
 */

const MARCA = 'PRUEBA-EV-AVISOS'
const ROLES = ['Recursos Humanos', 'Administrador', 'Subgerencia']
let admin: UsuarioSesion
let quienEnvio: { id: string }
let acuerdoId: string
let token: string

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
  const users = await prisma.user.findMany({ where: { estado: 'ACTIVO' }, include: { rol: { include: { permisos: true } } } })
  const conAprobar = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'contratos' && p.accion === 'APROBAR'))
  if (!conAprobar) throw new Error('No hay usuario con contratos:APROBAR en la base local')
  admin = await sesionDe(conAprobar.email)
  // Quien envió el enlace NO es de Talento Humano: así se ve que le llega por
  // ser quien envió, no por su rol.
  quienEnvio = users.find((u) => u.rol && !ROLES.includes(u.rol.nombre)) ?? conAprobar

  token = `${MARCA}-${Date.now()}-token-de-prueba`
  const expira = new Date(); expira.setUTCDate(expira.getUTCDate() + 30)
  const a = await prisma.acuerdoEvaluacion.create({
    data: {
      numero: `${MARCA}-${Date.now()}`, nombres: 'Aspirante', apellidos: 'De Prueba', numeroDocumento: '900000001',
      email: 'aspirante.prueba@ejemplo.local', cargoEvaluado: 'Auxiliar de bodega',
      fechaInicio: new Date(Date.UTC(2026, 8, 1)), fechaFin: new Date(Date.UTC(2026, 8, 15)),
      enviadoPorId: quienEnvio.id, enviadoEn: new Date(), tokenSubida: token, tokenExpiraEn: expira,
    },
  })
  acuerdoId = a.id
})

afterAll(async () => {
  const docs = await prisma.documento.findMany({ where: { entidadTipo: 'AcuerdoEvaluacion', entidadId: acuerdoId } })
  for (const d of docs) await eliminarArchivo(d.storagePath).catch(() => {})
  await prisma.documento.deleteMany({ where: { entidadTipo: 'AcuerdoEvaluacion', entidadId: acuerdoId } })
  await prisma.notificacion.deleteMany({ where: { evento: 'evaluacion_firmada', titulo: { contains: MARCA } } })
  await prisma.mensajeSaliente.deleteMany({ where: { asunto: { contains: MARCA } } })
  await prisma.auditLog.deleteMany({ where: { modelo: 'AcuerdoEvaluacion', registroId: acuerdoId } })
  await prisma.acuerdoEvaluacion.delete({ where: { id: acuerdoId } }).catch(() => {})
})

describe('Evaluación previa · avisos', () => {
  it('al devolver el firmado avisa en la app a quien envió el enlace y a Talento Humano, una sola vez a cada uno', async () => {
    const datos = new FormData()
    datos.set('token', token)
    datos.set('archivo', new File([Buffer.from('%PDF-1.4\n%%EOF\n')], 'firmado.pdf', { type: 'application/pdf' }))
    const res = await subirAcuerdoConToken(datos)
    expect(res).toEqual({ ok: true })

    const avisos = await prisma.notificacion.findMany({ where: { evento: 'evaluacion_firmada', titulo: { contains: MARCA } } })
    const porUsuario = new Map<string, number>()
    for (const n of avisos) porUsuario.set(n.userId, (porUsuario.get(n.userId) ?? 0) + 1)

    expect(porUsuario.get(quienEnvio.id)).toBe(1)
    const th = await prisma.user.findMany({ where: { estado: 'ACTIVO', rol: { nombre: { in: ROLES } } }, select: { id: true } })
    expect(th.length).toBeGreaterThan(0)
    for (const u of th) expect(porUsuario.get(u.id), `falta el aviso de ${u.id}`).toBe(1)
    // Nadie recibe dos (quien envió también puede ser de Talento Humano).
    for (const [, n] of porUsuario) expect(n).toBe(1)

    const aviso = avisos.find((n) => n.userId === quienEnvio.id)!
    expect(aviso.titulo).toContain('Aspirante De Prueba devolvió firmado el acuerdo')
    expect(aviso.enlace).toBe('/contratos/acuerdos')
    // El evento manda correo por defecto: queda en el outbox de cada destinatario.
    expect(await prisma.mensajeSaliente.count({ where: { asunto: { contains: MARCA } } })).toBe(porUsuario.size)
  })

  it('al decidir, el aspirante recibe la decisión por correo (sin observaciones internas)', async () => {
    actuarComo(admin)
    vi.mocked(enviarCorreo).mockClear()
    const res = await decidirAcuerdo({ id: acuerdoId, aprobado: true, observaciones: 'Comentario interno' })
    expect(res.ok).toBe(true)

    const alAspirante = vi.mocked(enviarCorreo).mock.calls.map(([c]) => c).find((c) => c.para === 'aspirante.prueba@ejemplo.local')
    expect(alAspirante).toBeDefined()
    expect(alAspirante!.asunto).toContain('Resultado de tu evaluación previa')
    expect(alAspirante!.html).toContain('aprobada')
    expect(alAspirante!.html).not.toContain('Comentario interno')
  })
})

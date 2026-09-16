import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { eliminarContratoLaboral } = await import('@/app/(app)/contratos/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Borrar un contrato laboral registrado por error. Se prueba contra la base
 * porque lo que importa son los efectos: que se vaya con su documento y su
 * alerta, que la ficha recupere el vínculo que le corresponde y que un contrato
 * con historia (firmado en la app) se niegue a borrarse.
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

const MARCA = 'PRUEBA-CT-BORRAR'
let th: UsuarioSesion
let colaboradorId: string
let sedeId: string
let vinculoOriginal: string
const creados: string[] = []

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

/** Un laboral de prueba, directo en la base, como si se hubiera subido por error. */
async function laboral(extra: Record<string, unknown> = {}) {
  const c = await prisma.contrato.create({
    data: {
      numero: `${MARCA}-${creados.length + 1}-${Date.now()}`, colaboradorId, sedeId,
      tipo: 'TERMINO_FIJO', modalidadTrabajo: 'PRESENCIAL', salarioBase: 1_750_905,
      fechaInicio: new Date(Date.UTC(2026, 8, 17)), fechaFin: new Date(Date.UTC(2026, 11, 31)),
      estado: 'ACTIVO', origenPdf: 'SUBIDO',
      ...extra,
    },
  })
  creados.push(c.id)
  return c
}

beforeAll(async () => {
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conBorrar = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'contratos' && p.accion === 'ELIMINAR'))
  if (!conBorrar) throw new Error('No hay usuario con contratos:ELIMINAR')
  th = await sesionDe(conBorrar.email)
  // Un contratista OPS: si se le sube un laboral por error, al borrarlo debe volver a OPS.
  const c = await prisma.colaborador.findFirstOrThrow({
    where: { estado: 'ACTIVO', tipoVinculo: 'OPS', contratosOps: { some: { estado: 'ACTIVO' } }, contratos: { none: {} } },
    select: { id: true, sedeId: true, tipoVinculo: true },
  })
  colaboradorId = c.id
  sedeId = c.sedeId
  vinculoOriginal = c.tipoVinculo
})

afterAll(async () => {
  await prisma.vencimiento.deleteMany({ where: { entidadTipo: 'Contrato', entidadId: { in: creados } } })
  await prisma.documento.deleteMany({ where: { entidadTipo: 'Contrato', entidadId: { in: creados } } })
  await prisma.contrato.deleteMany({ where: { id: { in: creados } } })
  await prisma.colaborador.update({ where: { id: colaboradorId }, data: { tipoVinculo: vinculoOriginal as never } })
})

describe('borrar un contrato laboral subido por error', () => {
  it('se lleva el contrato, su documento y su alerta, y la ficha vuelve a OPS', async () => {
    const c = await laboral()
    // Como al subirlo: la ficha pasó a término fijo, hay PDF y alerta de vencimiento.
    await prisma.colaborador.update({ where: { id: colaboradorId }, data: { tipoVinculo: 'TERMINO_FIJO' } })
    const doc = await prisma.documento.create({
      data: {
        entidadTipo: 'Contrato', entidadId: c.id, nombre: `Contrato laboral ${c.numero}`, bucket: 'documentos',
        storagePath: `contratos/${c.id}/${MARCA}.pdf`, mimeType: 'application/pdf', tamanoBytes: 10, sha256: 'x', nivelAcceso: 'GENERAL', subidoPorId: th.id,
      },
    })
    await prisma.vencimiento.create({
      data: { origen: 'CONTRATO_FIJO', entidadTipo: 'Contrato', entidadId: c.id, titulo: MARCA, fechaVencimiento: c.fechaFin!, estado: 'PENDIENTE' },
    })

    actuarComo(th)
    const r = datosDe(await eliminarContratoLaboral({ id: c.id }))
    expect(r.colaboradorId).toBe(colaboradorId)

    expect(await prisma.contrato.findUnique({ where: { id: c.id } })).toBeNull()
    expect(await prisma.documento.findUnique({ where: { id: doc.id } })).toBeNull()
    expect(await prisma.vencimiento.count({ where: { entidadTipo: 'Contrato', entidadId: c.id } })).toBe(0)
    const ficha = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId }, select: { tipoVinculo: true } })
    expect(ficha.tipoVinculo).toBe('OPS')
  })

  it('no borra un contrato que el trabajador ya firmó en la app', async () => {
    const c = await laboral({ firmaEmpleadoPath: 'firmas/prueba.png', firmaEmpleadoFecha: new Date() })
    actuarComo(th)
    expect(errorDe(await eliminarContratoLaboral({ id: c.id }))).toContain('Terminaciones')
    expect(await prisma.contrato.findUnique({ where: { id: c.id } })).not.toBeNull()
  })

  it('no borra un contrato con historia (prórroga)', async () => {
    const c = await laboral()
    await prisma.prorrogaContrato.create({
      data: { contratoId: c.id, numero: 1, fechaInicio: new Date(Date.UTC(2027, 0, 1)), fechaFin: new Date(Date.UTC(2027, 5, 30)) },
    })
    actuarComo(th)
    expect(errorDe(await eliminarContratoLaboral({ id: c.id }))).toContain('prórrogas')
    await prisma.prorrogaContrato.deleteMany({ where: { contratoId: c.id } })
  })
})

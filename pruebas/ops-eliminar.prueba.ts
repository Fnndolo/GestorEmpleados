import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { eliminarContratoOps } = await import('@/app/(app)/contratos/ops-acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Borrar un contrato OPS registrado por error: se lleva su PDF, su
 * autorización de datos y su alerta, y deja la ficha con el vínculo de lo que
 * quede. Lo que NO se puede borrar —firmado por el contratista, o con cuentas
 * de cobro— es lo que más importa probar: ahí el borrado sería pérdida de
 * información, no una corrección.
 */

const MARCA = 'PRUEBA-OPS-BORRAR'
let admin: UsuarioSesion
let colabId: string
let sedeId: string
const creados: string[] = []

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { rol: { include: { permisos: true } } } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!, rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre],
    estado: u.estado, debeCambiarPassword: false, colaboradorId: null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({ modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never })),
  }
}

async function crearOps(numero: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.contratoOps.create({
    data: {
      numero, colaboradorId: colabId, objeto: `${MARCA} objeto`, valorTotal: 3_000_000, valorMensual: 1_000_000,
      sedeId, fechaInicio: new Date(Date.UTC(2026, 8, 1)), fechaFin: new Date(Date.UTC(2026, 11, 31)),
      estado: 'ACTIVO', origenPdf: 'SUBIDO_PARA_FIRMA', ...extra,
    },
  })
  creados.push(c.id)
  return c
}

beforeAll(async () => {
  admin = await sesionDe('ricardo.pena@prueba.local')
  const c = await prisma.colaborador.findFirstOrThrow({ where: { estado: 'ACTIVO' }, select: { id: true, sedeId: true } })
  colabId = c.id
  sedeId = c.sedeId
})

afterAll(async () => {
  await prisma.documento.deleteMany({ where: { nombre: { contains: MARCA } } })
  await prisma.cuentaCobroOps.deleteMany({ where: { contratoOpsId: { in: creados } } })
  await prisma.contratoOps.deleteMany({ where: { id: { in: creados } } })
})

describe('eliminar un contrato OPS', () => {
  it('borra el contrato, sus documentos y su alerta de vencimiento', async () => {
    const c = await crearOps(`${MARCA}-1`)
    const doc = await prisma.documento.create({
      data: {
        entidadTipo: 'ContratoOps', entidadId: c.id, nombre: `${MARCA} contrato`, bucket: 'local',
        storagePath: `pruebas/${c.id}.pdf`, mimeType: 'application/pdf', tamanoBytes: 10, nivelAcceso: 'GENERAL', sedeId,
      },
    })
    await prisma.vencimiento.create({
      data: {
        entidadTipo: 'ContratoOps', entidadId: c.id, origen: 'CONTRATO_OPS', titulo: `${MARCA} vence`,
        fechaVencimiento: new Date(Date.UTC(2026, 11, 31)), estado: 'PENDIENTE', sedeId,
      },
    })
    await prisma.entregableOps.create({ data: { contratoOpsId: c.id, descripcion: `${MARCA} entregable` } })

    actuarComo(admin)
    const res = await eliminarContratoOps({ id: c.id })
    if (!res.ok) throw new Error(res.error)
    expect(res.datos.numero).toBe(`${MARCA}-1`)

    expect(await prisma.contratoOps.findUnique({ where: { id: c.id } })).toBeNull()
    expect(await prisma.documento.findUnique({ where: { id: doc.id } })).toBeNull()
    expect(await prisma.entregableOps.count({ where: { contratoOpsId: c.id } })).toBe(0)
    const venc = await prisma.vencimiento.findFirst({ where: { entidadTipo: 'ContratoOps', entidadId: c.id } })
    expect(venc === null || venc.estado === 'CANCELADO').toBe(true)
  })

  it('no borra uno que el contratista ya firmó', async () => {
    const c = await crearOps(`${MARCA}-2`, { estado: 'FIRMADO', firmaContratistaPath: 'firmas/x.png', firmaContratistaFecha: new Date() })
    actuarComo(admin)
    const res = await eliminarContratoOps({ id: c.id })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('ya lo firmó el contratista')
    expect(await prisma.contratoOps.findUnique({ where: { id: c.id } })).not.toBeNull()
  })

  it('no borra uno con cuentas de cobro radicadas', async () => {
    const c = await crearOps(`${MARCA}-3`)
    await prisma.cuentaCobroOps.create({
      data: {
        contratoOpsId: c.id, colaboradorId: colabId, numero: `${MARCA}-CC`, periodo: '2026-09',
        concepto: `${MARCA} servicios`, valor: 1_000_000, estado: 'RADICADA',
        fechaRadicacion: new Date(Date.UTC(2026, 8, 30)),
      },
    })
    actuarComo(admin)
    const res = await eliminarContratoOps({ id: c.id })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('cuentas de cobro')
    expect(await prisma.contratoOps.findUnique({ where: { id: c.id } })).not.toBeNull()
  })

  it('un empleado sin permiso de eliminar no puede borrarlo', async () => {
    const c = await crearOps(`${MARCA}-4`)
    actuarComo(await sesionDe('yeison.cordoba@prueba.local'))
    const res = await eliminarContratoOps({ id: c.id })
    expect(res.ok).toBe(false)
    expect(await prisma.contratoOps.findUnique({ where: { id: c.id } })).not.toBeNull()
  })
})

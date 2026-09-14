import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { cerrarContratoOps } = await import('@/app/(app)/contratos/ops-acciones')
const { crearTerminacion, anularTerminacion } = await import('@/app/(app)/terminaciones/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Cierre de un contrato OPS. Antes ningún OPS pasaba a TERMINADO: el aviso
 * semanal de «contrato vencido sin cerrar» pedía algo que no se podía hacer, y
 * «Fin de OPS» en Terminaciones retiraba a la persona dejando el contrato
 * activo. Se prueba contra la base porque lo que importa son los efectos: el
 * estado, la fecha y el motivo, la alerta de vencimiento apagada, y que
 * Terminaciones cierre (y al anularse reabra) los OPS vigentes.
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

const MARCA = 'PRUEBA-OPS-CIERRE'
let th: UsuarioSesion
let colaboradorId: string
let sedeId: string
const creados: string[] = []

const hoy = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d })()
const dias = (n: number) => { const d = new Date(hoy); d.setUTCDate(d.getUTCDate() + n); return d }
const iso = (d: Date) => d.toISOString().slice(0, 10)

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

/** Un OPS de prueba, directo en la base, con la vigencia que pida el caso. */
async function ops(fechaInicio: Date, fechaFin: Date, estado: 'ACTIVO' | 'FIRMADO' = 'ACTIVO') {
  const c = await prisma.contratoOps.create({
    data: {
      numero: `${MARCA}-${creados.length + 1}-${Date.now()}`, colaboradorId, objeto: MARCA, valorTotal: 1_000_000,
      sedeId, fechaInicio, fechaFin, estado,
    },
  })
  creados.push(c.id)
  return c
}

beforeAll(async () => {
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conEditar = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'contratos' && p.accion === 'EDITAR') && u.rol?.permisos.some((p) => p.modulo === 'terminaciones' && p.accion === 'CREAR'))
  if (!conEditar) throw new Error('No hay usuario con contratos:EDITAR y terminaciones:CREAR')
  th = await sesionDe(conEditar.email)
  // Un empleado raso con contrato laboral activo: cerrarle un OPS no le toca el
  // acceso, y si el retiro de prueba lo pasa a solo consulta, al anularse vuelve
  // al rol por defecto de su cargo, que para él es el mismo. (A alguien de
  // Recursos Humanos ese ida y vuelta le dejaría el rol de Empleado.)
  const c = await prisma.colaborador.findFirstOrThrow({
    where: { estado: 'ACTIVO', contratos: { some: { estado: 'ACTIVO' } }, usuario: { rol: { nombre: 'Empleado' } } },
    select: { id: true, sedeId: true },
  })
  colaboradorId = c.id
  sedeId = c.sedeId
})

afterAll(async () => {
  await prisma.vencimiento.deleteMany({ where: { entidadTipo: 'ContratoOps', entidadId: { in: creados } } })
  await prisma.contratoOps.deleteMany({ where: { id: { in: creados } } })
  await prisma.notificacion.deleteMany({ where: { evento: 'contrato_cerrado', mensaje: { contains: MARCA } } })
})

describe('cierre de un contrato OPS', () => {
  it('por vencimiento del plazo: pasa a Terminado con la fecha de fin, motivo y quién, y apaga su alerta', async () => {
    const c = await ops(dias(-100), dias(-10))
    actuarComo(th)
    const r = datosDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'VENCIMIENTO_PLAZO', fechaCierre: '', observacion: 'Sigue con contrato nuevo' }))
    expect(r.accesoRestringido).toBe(false)

    const ahora = await prisma.contratoOps.findUniqueOrThrow({ where: { id: c.id } })
    expect(ahora.estado).toBe('TERMINADO')
    expect(iso(ahora.cerradoEn!)).toBe(iso(dias(-10)))
    expect(ahora.motivoCierre).toBe('VENCIMIENTO_PLAZO')
    expect(ahora.cerradoPorId).toBe(th.id)
    expect(ahora.observacionCierre).toContain('contrato nuevo')
    // Ningún vencimiento pendiente para un contrato cerrado.
    const pendientes = await prisma.vencimiento.count({ where: { entidadTipo: 'ContratoOps', entidadId: c.id, estado: { notIn: ['RESUELTO', 'CANCELADO'] } } })
    expect(pendientes).toBe(0)
    // Y el contratista se entera.
    const aviso = await prisma.notificacion.findFirst({ where: { evento: 'contrato_cerrado', mensaje: { contains: c.numero } } })
    expect(aviso).toBeTruthy()
  })

  it('no se cierra "por vencimiento" un plazo que no ha vencido; sí de forma anticipada, con fecha válida', async () => {
    const c = await ops(dias(-30), dias(+60))
    actuarComo(th)
    expect(errorDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'VENCIMIENTO_PLAZO', fechaCierre: '' }))).toContain('todavía no ha vencido')
    expect(errorDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'TERMINACION_ANTICIPADA', fechaCierre: iso(dias(+1)) }))).toContain('futura')
    expect(errorDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'MUTUO_ACUERDO', fechaCierre: iso(dias(-40)) }))).toContain('anterior al inicio')

    datosDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'MUTUO_ACUERDO', fechaCierre: iso(hoy) }))
    const ahora = await prisma.contratoOps.findUniqueOrThrow({ where: { id: c.id } })
    expect(ahora.estado).toBe('TERMINADO')
    expect(ahora.motivoCierre).toBe('MUTUO_ACUERDO')
    expect(iso(ahora.cerradoEn!)).toBe(iso(hoy))
    // Cerrado no se vuelve a cerrar.
    expect(errorDe(await cerrarContratoOps({ contratoId: c.id, motivo: 'MUTUO_ACUERDO', fechaCierre: iso(hoy) }))).toContain('ya está cerrado')
  })

  it('un retiro en Terminaciones cierra los OPS vigentes, y anularlo los reabre tal como estaban', async () => {
    const activo = await ops(dias(-20), dias(+90), 'ACTIVO')
    const firmado = await ops(dias(-15), dias(+90), 'FIRMADO')
    actuarComo(th)
    const { id } = datosDe(await crearTerminacion({ colaboradorId, tipo: 'FIN_OPS', fechaRetiro: iso(hoy), motivo: MARCA }))
    try {
      for (const c of [activo, firmado]) {
        const ahora = await prisma.contratoOps.findUniqueOrThrow({ where: { id: c.id } })
        expect(ahora.estado).toBe('TERMINADO')
        expect(ahora.motivoCierre).toBe('RETIRO')
        expect(iso(ahora.cerradoEn!)).toBe(iso(hoy))
      }
    } finally {
      // Anular revierte todo: la persona vuelve a estar activa y cada OPS a su estado.
      datosDe(await anularTerminacion({ id, motivo: `${MARCA}: se registró por error` }))
    }
    expect((await prisma.contratoOps.findUniqueOrThrow({ where: { id: activo.id } })).estado).toBe('ACTIVO')
    const f = await prisma.contratoOps.findUniqueOrThrow({ where: { id: firmado.id } })
    // Sin firmas guardadas no puede volver a FIRMADO: vuelve a ACTIVO, que es lo honesto.
    expect(f.estado).toBe('ACTIVO')
    expect(f.motivoCierre).toBeNull()
    expect((await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } })).estado).toBe('ACTIVO')
  })
})

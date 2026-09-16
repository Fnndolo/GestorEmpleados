import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { subirContratoExistente } = await import('@/app/(app)/contratos/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Numeración de los contratos laborales (CT-<año>-####). Se prueba contra la
 * base porque el fallo real vivía ahí: al borrar un contrato registrado por
 * error, la numeración por «cantidad + 1» repetía un número que ya existía y
 * la base rechazaba el alta. Ahora se numera sobre el mayor existente.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }
function datosDe<T>(res: Resultado<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.datos
}

const MARCA = 'PRUEBA-CT-NUMERO'
const ANIO = new Date().getUTCFullYear()
let admin: UsuarioSesion
let colaboradorId: string
let sedeId: string
let vinculoOriginal: string
let pdfDataUri: string
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

/** El mayor consecutivo ya usado este año en la serie CT. */
async function mayorDelAnio(): Promise<number> {
  const serie = `CT-${ANIO}-`
  const previos = await prisma.contrato.findMany({ where: { numero: { startsWith: serie } }, select: { numero: true } })
  return previos.reduce((m, c) => Math.max(m, parseInt(c.numero.slice(serie.length), 10) || 0), 0)
}

/** Un laboral directo en la base con el número que se le indique. */
async function laboralConNumero(numero: string) {
  const c = await prisma.contrato.create({
    data: {
      numero, colaboradorId, sedeId, tipo: 'TERMINO_INDEFINIDO', modalidadTrabajo: 'PRESENCIAL',
      salarioBase: 1_750_905, fechaInicio: new Date(Date.UTC(2026, 8, 17)), estado: 'ACTIVO', origenPdf: 'SUBIDO',
      observaciones: MARCA,
    },
  })
  creados.push(c.id)
  return c
}

/** El alta real de la app: datos + PDF ya firmado en físico. */
async function subir() {
  const res = await subirContratoExistente({
    pdfBase64: pdfDataUri, autorizacionBase64: '',
    colaboradorId, tipo: 'TERMINO_INDEFINIDO', cargoId: '', sedeId,
    jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL',
    salarioBase: 2_000_000, ganaSalarioMinimo: false, tieneAuxTransporte: true, tipoSalario: 'ORDINARIO',
    fechaInicio: '2026-09-01', fechaFin: '', objetoObraLabor: '', etapaAprendizaje: '',
    observaciones: MARCA,
  })
  if (res.ok) creados.push(res.datos.id)
  return res
}

beforeAll(async () => {
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conCrear = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'contratos' && p.accion === 'CREAR'))
  if (!conCrear) throw new Error('No hay usuario con contratos:CREAR en la base local')
  admin = await sesionDe(conCrear.email)

  const c = await prisma.colaborador.findFirstOrThrow({
    where: { estado: 'ACTIVO', tipoVinculo: 'TERMINO_INDEFINIDO' },
    select: { id: true, sedeId: true, tipoVinculo: true },
  })
  colaboradorId = c.id
  sedeId = c.sedeId ?? (await prisma.sede.findFirstOrThrow({ where: { activa: true } })).id
  vinculoOriginal = c.tipoVinculo

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.addPage([612, 792])
  pdfDataUri = 'data:application/pdf;base64,' + Buffer.from(await doc.save()).toString('base64')
})

afterAll(async () => {
  await prisma.vencimiento.deleteMany({ where: { entidadTipo: 'Contrato', entidadId: { in: creados } } })
  await prisma.documento.deleteMany({ where: { entidadTipo: 'Contrato', entidadId: { in: creados } } })
  await prisma.contrato.deleteMany({ where: { id: { in: creados } } })
  await prisma.colaborador.update({ where: { id: colaboradorId }, data: { tipoVinculo: vinculoOriginal as never } })
})

describe('Contratos laborales · numeración', () => {
  beforeAll(() => actuarComo(admin))

  it('numera sobre el mayor existente, no sobre la cantidad: tras borrar uno, el siguiente alta no repite número', async () => {
    const base = await mayorDelAnio()
    // Dos contratos seguidos; se borra el primero, como cuando se registra uno por error.
    const primero = await laboralConNumero(`CT-${ANIO}-${String(base + 1).padStart(4, '0')}`)
    await laboralConNumero(`CT-${ANIO}-${String(base + 2).padStart(4, '0')}`)
    await prisma.contrato.delete({ where: { id: primero.id } })
    creados.splice(creados.indexOf(primero.id), 1)

    // Con «cantidad + 1» aquí salía de nuevo el número base+2 y la base lo rechazaba.
    const { id } = datosDe(await subir())
    const creado = await prisma.contrato.findUniqueOrThrow({ where: { id }, select: { numero: true } })
    expect(creado.numero).toBe(`CT-${ANIO}-${String(base + 3).padStart(4, '0')}`)
  })

  it('cada alta toma el consecutivo siguiente', async () => {
    const antes = await mayorDelAnio()
    const { id } = datosDe(await subir())
    const creado = await prisma.contrato.findUniqueOrThrow({ where: { id }, select: { numero: true } })
    expect(creado.numero).toBe(`CT-${ANIO}-${String(antes + 1).padStart(4, '0')}`)
  })
})

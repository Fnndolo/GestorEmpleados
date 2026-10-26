'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { ciudadSchema, sedeSchema } from '@/lib/validaciones/catalogos'

function limpiar<T extends Record<string, unknown>>(o: T): T {
  const r = { ...o }
  for (const k in r) if (r[k] === '') (r as Record<string, unknown>)[k] = null
  return r
}

export const crearCiudad = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: ciudadSchema },
  async (datos) => {
    await dbAuditado.ciudad.create({ data: limpiar(datos) })
    revalidatePath('/configuracion/sedes')
    // Las sedes alimentan los selectores de la ficha, contratos y el cambiador
    // de sede del shell: sin esto, una recién creada no aparece hasta recargar.
    revalidatePath('/', 'layout')
  },
)

export const editarCiudad = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: ciudadSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    await dbAuditado.ciudad.update({ where: { id }, data: limpiar(resto) })
    revalidatePath('/configuracion/sedes')
    revalidatePath('/', 'layout')
  },
)

export const eliminarCiudad = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    // La ciudad no tiene estado activo/inactivo: solo se puede borrar si nadie
    // la usa, ni como sede ni como ciudad de residencia de un colaborador.
    const ciudad = await prisma.ciudad.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { sedes: true, colaboradores: true } } },
    })
    const { sedes, colaboradores } = ciudad._count
    if (sedes > 0 || colaboradores > 0) {
      const usos = [
        sedes > 0 ? `${sedes} sede(s)` : null,
        colaboradores > 0 ? `${colaboradores} colaborador(es)` : null,
      ].filter(Boolean).join(' y ')
      throw new ErrorNegocio(`No se puede eliminar: la ciudad está en uso por ${usos}.`)
    }
    await dbAuditado.ciudad.delete({ where: { id } })
    revalidatePath('/configuracion/sedes')
    revalidatePath('/', 'layout')
  },
)

export const crearSede = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: sedeSchema },
  async (datos) => {
    if (datos.esPrincipal) {
      await prisma.sede.updateMany({ where: { esPrincipal: true }, data: { esPrincipal: false } })
    }
    await dbAuditado.sede.create({ data: limpiar(datos) })
    revalidatePath('/configuracion/sedes')
    // Las sedes alimentan los selectores de la ficha, contratos y el cambiador
    // de sede del shell: sin esto, una recién creada no aparece hasta recargar.
    revalidatePath('/', 'layout')
  },
)

export const editarSede = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: sedeSchema.extend({ id: z.uuid() }) },
  async (datos) => {
    const { id, ...resto } = datos
    if (resto.esPrincipal) {
      await prisma.sede.updateMany({
        where: { esPrincipal: true, NOT: { id } },
        data: { esPrincipal: false },
      })
    }
    await dbAuditado.sede.update({ where: { id }, data: limpiar(resto) })
    revalidatePath('/configuracion/sedes')
    // Las sedes alimentan los selectores de la ficha, contratos y el cambiador
    // de sede del shell: sin esto, una recién creada no aparece hasta recargar.
    revalidatePath('/', 'layout')
  },
)

export const alternarSede = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activa: z.boolean() }) },
  async ({ id, activa }) => {
    const sede = await prisma.sede.findUniqueOrThrow({ where: { id } })
    if (sede.esPrincipal && !activa) {
      throw new ErrorNegocio('No puedes desactivar la sede principal.')
    }
    await dbAuditado.sede.update({ where: { id }, data: { activa } })
    revalidatePath('/configuracion/sedes')
    // Las sedes alimentan los selectores de la ficha, contratos y el cambiador
    // de sede del shell: sin esto, una recién creada no aparece hasta recargar.
    revalidatePath('/', 'layout')
  },
)

/**
 * Borra una sede creada por error, con el motivo (queda en auditoría). Solo si
 * nadie la usa: con colaboradores, contratos, usuarios o cronogramas el camino
 * es desactivarla, para no perder el histórico.
 */
export const eliminarSede = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se elimina.').max(300) }) },
  async ({ id, motivo }) => {
    const sede = await prisma.sede.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { colaboradores: true, contratos: true, contratosOps: true, usuarios: true, cronogramasDominicales: true, turnosDominicales: true, activos: true } } },
    })
    if (sede.esPrincipal) throw new ErrorNegocio('Es la sede principal: marca otra como principal antes de eliminarla.')
    const c = sede._count
    const usos = [
      c.colaboradores > 0 ? `${c.colaboradores} colaborador(es)` : null,
      c.contratos + c.contratosOps > 0 ? `${c.contratos + c.contratosOps} contrato(s)` : null,
      c.usuarios > 0 ? `${c.usuarios} usuario(s) asignado(s)` : null,
      c.cronogramasDominicales + c.turnosDominicales > 0 ? `${c.cronogramasDominicales} cronograma(s) dominical(es)` : null,
      c.activos > 0 ? `${c.activos} activo(s)` : null,
    ].filter(Boolean)
    if (usos.length) throw new ErrorNegocio(`No se puede eliminar: la sede tiene ${usos.join(', ')}. Desactívala en su lugar.`)
    await dbAuditado.sede.delete({ where: { id } })
    await auditar('ELIMINAR', 'Sede', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/configuracion/sedes')
    revalidatePath('/', 'layout')
    return { ok: true }
  },
)

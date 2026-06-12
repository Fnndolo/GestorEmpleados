'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
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
  },
)

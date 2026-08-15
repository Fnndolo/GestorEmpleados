'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import {
  entidadSSSchema,
  bancoSchema,
  type EntidadSSInput,
  type BancoInput,
} from '@/lib/validaciones/catalogos'

const RUTA = '/configuracion/entidades'

/**
 * Traduce la violación de índice único a un mensaje entendible.
 * En entidades el índice es (tipo, nombre); en bancos, el nombre.
 */
async function sinDuplicados<T>(duplicado: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErrorNegocio(duplicado)
    }
    throw e
  }
}

function datosEntidad(d: EntidadSSInput) {
  return { tipo: d.tipo, nombre: d.nombre, codigo: d.codigo || null, activa: d.activa }
}

export const crearEntidad = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: entidadSSSchema },
  async (datos) => {
    await sinDuplicados('Ya existe una entidad de ese tipo con ese nombre.', () =>
      dbAuditado.entidadSeguridadSocial.create({ data: datosEntidad(datos) }),
    )
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const editarEntidad = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: entidadSSSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    // El cambio se refleja en los colaboradores que la referencian (FK).
    await sinDuplicados('Ya existe una entidad de ese tipo con ese nombre.', () =>
      dbAuditado.entidadSeguridadSocial.update({ where: { id }, data: datosEntidad(resto) }),
    )
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const alternarEntidad = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activa: z.boolean() }) },
  async ({ id, activa }) => {
    // Desactivar NO borra: la entidad deja de ofrecerse en los formularios, pero
    // quienes ya la tienen asignada la conservan.
    await dbAuditado.entidadSeguridadSocial.update({ where: { id }, data: { activa } })
    revalidatePath(RUTA)
    return { ok: true }
  },
)

function datosBanco(d: BancoInput) {
  return { nombre: d.nombre, codigoAch: d.codigoAch || null, activo: d.activo }
}

export const crearBanco = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: bancoSchema },
  async (datos) => {
    await sinDuplicados('Ya existe un banco con ese nombre.', () =>
      dbAuditado.banco.create({ data: datosBanco(datos) }),
    )
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const editarBanco = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: bancoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    await sinDuplicados('Ya existe un banco con ese nombre.', () =>
      dbAuditado.banco.update({ where: { id }, data: datosBanco(resto) }),
    )
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const alternarBanco = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async ({ id, activo }) => {
    await dbAuditado.banco.update({ where: { id }, data: { activo } })
    revalidatePath(RUTA)
    return { ok: true }
  },
)

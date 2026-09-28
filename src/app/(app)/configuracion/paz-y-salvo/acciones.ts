'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'

/**
 * Áreas del paz y salvo. Cambiarlas solo afecta a las terminaciones que se
 * registren después: las que ya existen copiaron sus áreas al crearse.
 */

const RUTA = '/configuracion/paz-y-salvo'

const areaSchema = z.object({
  nombre: z.string().trim().min(2, 'Indica el nombre del área.').max(60),
  concepto: z.string().trim().min(3, 'Indica qué se verifica.').max(160),
  responsableId: z.uuid().nullable(),
  chequeo: z.enum(['ACTIVOS', 'PRESTAMOS']).nullable(),
})

async function sinDuplicado<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new ErrorNegocio('Ya existe un área con ese nombre.')
    throw e
  }
}

function listo() {
  revalidatePath(RUTA)
  revalidatePath('/', 'layout')
}

export const crearAreaPazYSalvo = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: areaSchema },
  async (d) => {
    const ultimo = await prisma.areaPazYSalvo.aggregate({ _max: { orden: true } })
    await sinDuplicado(() => dbAuditado.areaPazYSalvo.create({ data: { ...d, orden: (ultimo._max.orden ?? 0) + 1 } }))
    listo()
  },
)

export const editarAreaPazYSalvo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: areaSchema.extend({ id: z.uuid() }) },
  async ({ id, ...d }) => {
    await sinDuplicado(() => dbAuditado.areaPazYSalvo.update({ where: { id }, data: d }))
    listo()
  },
)

export const alternarAreaPazYSalvo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activa: z.boolean() }) },
  async ({ id, activa }) => {
    await dbAuditado.areaPazYSalvo.update({ where: { id }, data: { activa } })
    listo()
  },
)

/** Sube o baja un área: es el orden en que salen en el checklist y en el acta. */
export const moverAreaPazYSalvo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), direccion: z.enum(['arriba', 'abajo']) }) },
  async ({ id, direccion }) => {
    const areas = await prisma.areaPazYSalvo.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }], select: { id: true } })
    const i = areas.findIndex((a) => a.id === id)
    const j = direccion === 'arriba' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= areas.length) return
    ;[areas[i], areas[j]] = [areas[j], areas[i]]
    for (const [orden, a] of areas.entries()) await prisma.areaPazYSalvo.update({ where: { id: a.id }, data: { orden: orden + 1 } })
    listo()
  },
)

export const eliminarAreaPazYSalvo = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.areaPazYSalvo.delete({ where: { id } })
    listo()
  },
)

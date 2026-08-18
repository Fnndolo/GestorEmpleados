'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { areaSchema, type AreaInput } from '@/lib/validaciones/catalogos'

const RUTA = '/configuracion/areas'

/** Las áreas alimentan los selectores de la ficha y de cargos en toda la app. */
function revalidarAreas() {
  revalidatePath(RUTA)
  revalidatePath('/', 'layout')
}

function datosArea(d: AreaInput) {
  return {
    nombre: d.nombre,
    padreId: d.padreId || null,
    responsableId: d.responsableId || null,
    activa: d.activa,
  }
}

async function sinDuplicados<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ErrorNegocio('Ya existe un área con ese nombre.')
    }
    throw e
  }
}

/**
 * Impide que un área quede colgando de sí misma o de una de sus descendientes,
 * que dejaría el organigrama en un ciclo infinito. Recorre hacia arriba desde
 * el padre propuesto: si llega al área que estamos editando, hay ciclo.
 */
async function validarJerarquia(areaId: string, padreId: string | null) {
  if (!padreId) return
  if (padreId === areaId) throw new ErrorNegocio('Un área no puede depender de sí misma.')

  const padres = new Map(
    (await prisma.area.findMany({ select: { id: true, padreId: true } })).map((a) => [a.id, a.padreId]),
  )
  let actual: string | null | undefined = padreId
  const visitados = new Set<string>()
  while (actual) {
    if (actual === areaId) {
      throw new ErrorNegocio('No puedes colgar un área de una de sus propias subáreas.')
    }
    if (visitados.has(actual)) break // ciclo preexistente: no es asunto de esta validación
    visitados.add(actual)
    actual = padres.get(actual)
  }
}

export const crearArea = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: areaSchema },
  async (datos) => {
    await sinDuplicados(() => dbAuditado.area.create({ data: datosArea(datos) }))
    revalidarAreas()
    return { ok: true }
  },
)

export const editarArea = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: areaSchema.extend({ id: z.uuid() }) },
  async ({ id, ...resto }) => {
    await validarJerarquia(id, resto.padreId || null)
    await sinDuplicados(() => dbAuditado.area.update({ where: { id }, data: datosArea(resto) }))
    revalidarAreas()
    return { ok: true }
  },
)

export const alternarArea = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activa: z.boolean() }) },
  async ({ id, activa }) => {
    // Desactivar no borra: sale de los selectores, pero quienes ya la tienen
    // asignada la conservan.
    await dbAuditado.area.update({ where: { id }, data: { activa } })
    revalidarAreas()
    return { ok: true }
  },
)

export const eliminarArea = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    // Solo se permite borrar un área que nadie esté usando; en cualquier otro
    // caso el camino correcto es desactivarla para no perder el histórico.
    const area = await prisma.area.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { cargos: true, colaboradores: true, hijas: true } } },
    })
    const { cargos, colaboradores, hijas } = area._count
    if (cargos > 0 || colaboradores > 0 || hijas > 0) {
      const usos = [
        cargos > 0 ? `${cargos} cargo(s)` : null,
        colaboradores > 0 ? `${colaboradores} colaborador(es)` : null,
        hijas > 0 ? `${hijas} subárea(s)` : null,
      ].filter(Boolean).join(', ')
      throw new ErrorNegocio(`No se puede eliminar: el área tiene ${usos}. Desactívala en su lugar.`)
    }
    await dbAuditado.area.delete({ where: { id } })
    revalidarAreas()
    return { ok: true }
  },
)

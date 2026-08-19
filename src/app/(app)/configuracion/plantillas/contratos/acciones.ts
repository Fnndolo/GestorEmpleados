'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { plantillaContratoSchema } from '@/lib/validaciones/plantilla-contrato'

const RUTA = '/configuracion/plantillas/contratos'

/** Las plantillas alimentan la creación de contratos en todo el módulo. */
function revalidar(id?: string) {
  revalidatePath(RUTA)
  if (id) revalidatePath(`${RUTA}/${id}`)
  revalidatePath('/contratos')
}

export const crearPlantilla = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: plantillaContratoSchema },
  async (d) => {
    const creada = await dbAuditado.plantillaContrato.create({
      data: {
        nombre: d.nombre,
        tipo: d.tipo,
        titulo: d.titulo,
        intro: d.intro,
        cierre: d.cierre || '',
        activa: d.activa,
        clausulas: {
          create: d.clausulas.map((c, i) => ({ orden: i + 1, titulo: c.titulo, cuerpo: c.cuerpo })),
        },
      },
    })
    revalidar(creada.id)
    return { id: creada.id }
  },
)

export const editarPlantilla = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: plantillaContratoSchema.extend({ id: z.uuid() }) },
  async ({ id, ...d }) => {
    // Las cláusulas se reemplazan en bloque: el editor manda la lista completa
    // en su orden final, y así el `orden` siempre queda consecutivo sin huecos.
    await dbAuditado.plantillaContrato.update({
      where: { id },
      data: {
        nombre: d.nombre,
        tipo: d.tipo,
        titulo: d.titulo,
        intro: d.intro,
        cierre: d.cierre || '',
        activa: d.activa,
      },
    })
    await prisma.clausulaPlantilla.deleteMany({ where: { plantillaId: id } })
    await prisma.clausulaPlantilla.createMany({
      data: d.clausulas.map((c, i) => ({ plantillaId: id, orden: i + 1, titulo: c.titulo, cuerpo: c.cuerpo })),
    })
    revalidar(id)
    return { ok: true }
  },
)

export const eliminarPlantilla = accion(
  { modulo: 'configuracion', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const plantilla = await prisma.plantillaContrato.findUniqueOrThrow({ where: { id }, select: { tipo: true, activa: true } })
    // Sin plantilla activa de un tipo no se pueden crear contratos de ese tipo:
    // se evita dejar el módulo sin salida por borrar la última.
    if (plantilla.activa) {
      const otras = await prisma.plantillaContrato.count({
        where: { tipo: plantilla.tipo, activa: true, NOT: { id } },
      })
      if (otras === 0) {
        throw new ErrorNegocio(
          `Es la única plantilla activa de tipo ${plantilla.tipo}: sin ella no se pueden crear contratos. Crea o activa otra antes de borrarla.`,
        )
      }
    }
    // Las cláusulas se van solas (onDelete: Cascade).
    await dbAuditado.plantillaContrato.delete({ where: { id } })
    revalidar()
    return { ok: true }
  },
)

/** Copia una plantilla para probar cambios sin tocar la que está en uso. */
export const duplicarPlantilla = accion(
  { modulo: 'configuracion', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const p = await prisma.plantillaContrato.findUniqueOrThrow({
      where: { id },
      include: { clausulas: { orderBy: { orden: 'asc' } } },
    })
    const copia = await dbAuditado.plantillaContrato.create({
      data: {
        nombre: `${p.nombre} (copia)`,
        tipo: p.tipo,
        titulo: p.titulo,
        intro: p.intro,
        cierre: p.cierre,
        // La copia nace inactiva: se activa cuando esté revisada.
        activa: false,
        clausulas: { create: p.clausulas.map((c) => ({ orden: c.orden, titulo: c.titulo, cuerpo: c.cuerpo })) },
      },
    })
    revalidar(copia.id)
    return { id: copia.id }
  },
)

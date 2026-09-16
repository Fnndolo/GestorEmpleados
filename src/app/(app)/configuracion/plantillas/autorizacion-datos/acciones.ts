'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { autorizacionPorDefecto, categoriaAutorizacion } from '@/lib/plantillas-documento/autorizacion-datos'

const RUTAS = ['/configuracion/plantillas', '/configuracion/plantillas/autorizacion-datos']

const vinculoSchema = z.enum(['OPS', 'LABORAL']).default('OPS')

const plantillaSchema = z.object({
  vinculo: vinculoSchema,
  titulo: z.string().trim().min(3, 'El título es muy corto').max(200),
  contenido: z.string().trim().min(20, 'El texto es muy corto').max(12000, 'El texto es demasiado largo'),
})

/**
 * Guarda el texto de la autorización de datos del vínculo indicado. Hay una
 * plantilla por vínculo (categorías AUTORIZACION_DATOS y
 * AUTORIZACION_DATOS_LABORAL): se actualiza si existe, se crea si no. Aplica
 * desde el siguiente documento que se genere; los ya emitidos no cambian.
 */
export const guardarPlantillaAutorizacion = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: plantillaSchema },
  async (d) => {
    const categoria = categoriaAutorizacion(d.vinculo)
    const actual = await prisma.plantillaDocumento.findFirst({ where: { categoria } })
    if (actual) {
      await dbAuditado.plantillaDocumento.update({
        where: { id: actual.id },
        data: { nombre: d.titulo, contenido: d.contenido, activa: true },
      })
    } else {
      await dbAuditado.plantillaDocumento.create({
        data: { nombre: d.titulo, categoria, contenido: d.contenido, activa: true },
      })
    }
    for (const r of RUTAS) revalidatePath(r)
    return { ok: true }
  },
)

/** Vuelve al texto que trae la aplicación para ese vínculo (borra la plantilla personalizada). */
export const restaurarPlantillaAutorizacion = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ vinculo: vinculoSchema }) },
  async (d) => {
    const filas = await prisma.plantillaDocumento.findMany({ where: { categoria: categoriaAutorizacion(d.vinculo) }, select: { id: true } })
    for (const f of filas) await dbAuditado.plantillaDocumento.delete({ where: { id: f.id } })
    for (const r of RUTAS) revalidatePath(r)
    return { ...autorizacionPorDefecto(d.vinculo) }
  },
)

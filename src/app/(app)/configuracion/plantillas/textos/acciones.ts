'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { CLAVES_TEXTO, TEXTOS } from '@/lib/plantillas-documento/textos'

const RUTA = '/configuracion/plantillas'

const claveSchema = z.enum(CLAVES_TEXTO)

/**
 * Guarda el texto de uno de los documentos editables (actas de Mis entregas,
 * orden de pago de horas extra, certificaciones). Hay una sola plantilla por
 * clave (es la categoría en `PlantillaDocumento`): se actualiza si existe, se
 * crea si no. Aplica desde el siguiente documento que se genere; los ya
 * emitidos no cambian.
 */
export const guardarPlantillaTexto = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: claveSchema,
      titulo: z.string().trim().min(3, 'El título es muy corto').max(200),
      contenido: z.string().trim().min(5, 'El texto es muy corto').max(12000, 'El texto es demasiado largo'),
      /** ¿El PDF va sobre el papel membretado de Ajustes? */
      usaMembrete: z.boolean(),
    }),
  },
  async (d) => {
    const actual = await prisma.plantillaDocumento.findFirst({ where: { categoria: d.clave } })
    if (actual) {
      await dbAuditado.plantillaDocumento.update({
        where: { id: actual.id },
        data: { nombre: d.titulo, contenido: d.contenido, usaMembrete: d.usaMembrete, activa: true },
      })
    } else {
      await dbAuditado.plantillaDocumento.create({
        data: { nombre: d.titulo, categoria: d.clave, contenido: d.contenido, usaMembrete: d.usaMembrete, activa: true },
      })
    }
    revalidatePath(RUTA)
    return { ok: true }
  },
)

/** Vuelve al texto que trae la aplicación (borra la plantilla personalizada). */
export const restaurarPlantillaTexto = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ clave: claveSchema }) },
  async (d) => {
    const filas = await prisma.plantillaDocumento.findMany({ where: { categoria: d.clave }, select: { id: true } })
    for (const f of filas) await dbAuditado.plantillaDocumento.delete({ where: { id: f.id } })
    revalidatePath(RUTA)
    return { ...TEXTOS[d.clave].defecto, usaMembrete: TEXTOS[d.clave].membrete }
  },
)

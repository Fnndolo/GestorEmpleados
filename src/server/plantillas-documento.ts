import { prisma } from '@/lib/db'
import {
  AUTORIZACION_POR_DEFECTO, CATEGORIA_AUTORIZACION, type PlantillaAutorizacion,
} from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Plantilla vigente de la autorización de tratamiento de datos: la que la
 * empresa guardó en Ajustes → Plantillas de documentos o, si nadie la ha tocado,
 * la de fábrica. Se consulta en cada render para que un cambio en Ajustes
 * aplique de inmediato al siguiente documento que se genere.
 */
export async function plantillaAutorizacionDatos(): Promise<PlantillaAutorizacion & { personalizada: boolean }> {
  const p = await prisma.plantillaDocumento.findFirst({
    where: { categoria: CATEGORIA_AUTORIZACION, activa: true },
    orderBy: { actualizadoEn: 'desc' },
  })
  if (!p) return { ...AUTORIZACION_POR_DEFECTO, personalizada: false }
  return { titulo: p.nombre, contenido: p.contenido, personalizada: true }
}

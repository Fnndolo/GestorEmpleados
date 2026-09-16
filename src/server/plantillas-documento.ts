import { prisma } from '@/lib/db'
import {
  autorizacionPorDefecto, categoriaAutorizacion, type PlantillaAutorizacion, type VinculoAutorizacion,
} from '@/lib/plantillas-documento/autorizacion-datos'

/**
 * Plantilla vigente de la autorización de tratamiento de datos del vínculo
 * indicado (OPS o laboral): la que la empresa guardó en Ajustes → Plantillas de
 * documentos o, si nadie la ha tocado, la de fábrica. Se consulta en cada render
 * para que un cambio en Ajustes aplique de inmediato al siguiente documento que
 * se genere.
 */
export async function plantillaAutorizacionDatos(
  vinculo: VinculoAutorizacion = 'OPS',
): Promise<PlantillaAutorizacion & { personalizada: boolean; actualizadoEn: Date | null }> {
  const p = await prisma.plantillaDocumento.findFirst({
    where: { categoria: categoriaAutorizacion(vinculo), activa: true },
    orderBy: { actualizadoEn: 'desc' },
  })
  if (!p) return { ...autorizacionPorDefecto(vinculo), personalizada: false, actualizadoEn: null }
  return { titulo: p.nombre, contenido: p.contenido, personalizada: true, actualizadoEn: p.actualizadoEn }
}

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { festivosDelAnio } from '@/lib/dias-habiles'
import { parseFechaISO } from '@/lib/fechas'

const RUTA = '/configuracion/festivos'
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha.')

/**
 * Corrige el calendario cuando una ley o la Corte cambian un festivo: agrega un
 * día que la plataforma no tiene o quita uno que dejó de serlo. Afecta todo lo
 * que usa festivos (recargos, días hábiles, plazos, turnos dominicales).
 */
export const corregirFestivo = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      fecha,
      tipo: z.enum(['ADD', 'REMOVE']),
      nombre: z.string().trim().min(3, 'Escribe el nombre o la norma que lo respalda.').max(150),
    }),
  },
  async (d) => {
    const anio = Number(d.fecha.slice(0, 4))
    const deLey = festivosDelAnio(anio).some((f) => f.fecha === d.fecha)
    if (d.tipo === 'ADD' && deLey) throw new ErrorNegocio('Ese día ya es festivo en el calendario.')
    if (d.tipo === 'REMOVE' && !deLey) throw new ErrorNegocio('Ese día no es festivo en el calendario: no hay nada que quitar.')
    const dia = parseFechaISO(d.fecha)!
    if (await prisma.festivoExcepcion.findUnique({ where: { fecha: dia } })) throw new ErrorNegocio('Ese día ya tiene una corrección. Deshazla primero.')
    await dbAuditado.festivoExcepcion.create({ data: { fecha: dia, tipo: d.tipo, nombre: d.nombre } })
    revalidatePath(RUTA)
  },
)

/** Deshace una corrección: el día vuelve a lo que dice el calendario de ley. */
export const deshacerCorreccionFestivo = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.festivoExcepcion.delete({ where: { id } })
    revalidatePath(RUTA)
  },
)

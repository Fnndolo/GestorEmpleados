'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'

/** Actualiza el valor vigente de un parámetro legal de nómina (SMMLV o auxilio de transporte). */
export const actualizarParametroNomina = accion(
  {
    modulo: 'configuracion',
    accion: 'EDITAR',
    schema: z.object({
      clave: z.enum(['SMMLV', 'AUX_TRANSPORTE']),
      valor: z.coerce.number().min(0),
    }),
  },
  async (d) => {
    const actual = await prisma.parametroLegal.findFirst({ where: { clave: d.clave }, orderBy: { vigenciaDesde: 'desc' } })
    if (!actual) throw new ErrorNegocio('No existe el parámetro. Ejecuta el seed de nómina primero.')
    await dbAuditado.parametroLegal.update({ where: { id: actual.id }, data: { valor: d.valor } })
    revalidatePath('/configuracion/parametros-nomina')
    return { ok: true }
  },
)

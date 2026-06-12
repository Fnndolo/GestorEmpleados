'use server'

import { revalidatePath } from 'next/cache'
import { dbAuditado } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion } from '@/server/accion'
import { empresaSchema } from '@/lib/validaciones/catalogos'

export const guardarEmpresa = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: empresaSchema },
  async (datos) => {
    const actual = await prisma.configuracionEmpresa.findFirst()
    if (!actual) {
      await dbAuditado.configuracionEmpresa.create({ data: datos })
    } else {
      await dbAuditado.configuracionEmpresa.update({ where: { id: actual.id }, data: datos })
    }
    revalidatePath('/configuracion/empresa')
    return { ok: true }
  },
)

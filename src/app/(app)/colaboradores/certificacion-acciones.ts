'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { generarCertificacion } from '@/server/certificaciones'

export const generarCertificacionRRHH = accion(
  {
    modulo: 'colaboradores',
    accion: 'EDITAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA']),
      dirigidaA: z.string().max(200).optional(),
    }),
  },
  async (d, usuario) => {
    const r = await generarCertificacion({
      colaboradorId: d.colaboradorId,
      tipo: d.tipo,
      dirigidaA: d.dirigidaA || null,
      generadoPorId: usuario.id,
    })
    revalidatePath(`/colaboradores/${d.colaboradorId}`)
    return r
  },
)

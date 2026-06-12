'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'

const reglaSchema = z.object({
  id: z.uuid(),
  diasPrimeraAlerta: z.coerce.number().int().min(0).max(120),
  primeraEnHabiles: z.boolean(),
  diasUltimaAlerta: z.coerce.number().int().min(0).max(120),
  ultimaEnHabiles: z.boolean(),
})

export const guardarReglaAlerta = accion(
  { modulo: 'configuracion', accion: 'EDITAR', schema: reglaSchema },
  async (d) => {
    await dbAuditado.reglaAlerta.update({
      where: { id: d.id },
      data: {
        diasPrimeraAlerta: d.diasPrimeraAlerta,
        primeraEnHabiles: d.primeraEnHabiles,
        diasUltimaAlerta: d.diasUltimaAlerta,
        ultimaEnHabiles: d.ultimaEnHabiles,
      },
    })
    revalidatePath('/configuracion/alertas')
  },
)

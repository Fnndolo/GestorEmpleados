'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'

export const crearEvaluacion = accion(
  {
    modulo: 'evaluaciones',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      periodo: z.string().trim().min(2).max(20),
      puntaje: z.coerce.number().min(0).max(100),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fortalezas: z.string().max(1000).optional(),
      oportunidades: z.string().max(1000).optional(),
      compromisos: z.string().max(1000).optional(),
    }),
  },
  async (d, usuario) => {
    await dbAuditado.evaluacionDesempeno.create({
      data: {
        colaboradorId: d.colaboradorId, periodo: d.periodo, puntaje: d.puntaje, fecha: parseFechaISO(d.fecha)!,
        evaluadorId: usuario.id, fortalezas: d.fortalezas, oportunidades: d.oportunidades, compromisos: d.compromisos,
      },
    })
    revalidatePath('/evaluaciones')
  },
)

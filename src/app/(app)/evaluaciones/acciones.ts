'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'

const evaluacionSchema = z.object({
  colaboradorId: z.uuid(),
  periodo: z.string().trim().min(2).max(20),
  puntaje: z.coerce.number().min(0).max(100),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fortalezas: z.string().trim().max(1000).optional(),
  oportunidades: z.string().trim().max(1000).optional(),
  compromisos: z.string().trim().max(1000).optional(),
})

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearEvaluacion = accion(
  { modulo: 'evaluaciones', accion: 'CREAR', schema: evaluacionSchema },
  async (d, usuario) => {
    await dbAuditado.evaluacionDesempeno.create({
      data: {
        colaboradorId: d.colaboradorId, periodo: d.periodo, puntaje: d.puntaje, fecha: parseFechaISO(d.fecha)!,
        evaluadorId: usuario.id, fortalezas: v(d.fortalezas), oportunidades: v(d.oportunidades), compromisos: v(d.compromisos),
      },
    })
    revalidatePath('/evaluaciones')
  },
)

/** Corregir una evaluación: todos los campos del formulario de crear. El evaluador original se conserva. */
export const editarEvaluacion = accion(
  { modulo: 'evaluaciones', accion: 'EDITAR', schema: evaluacionSchema.extend({ id: z.uuid() }) },
  async (d) => {
    await dbAuditado.evaluacionDesempeno.update({
      where: { id: d.id },
      data: {
        colaboradorId: d.colaboradorId, periodo: d.periodo, puntaje: d.puntaje, fecha: parseFechaISO(d.fecha)!,
        fortalezas: v(d.fortalezas), oportunidades: v(d.oportunidades), compromisos: v(d.compromisos),
      },
    })
    revalidatePath('/evaluaciones')
    return { ok: true }
  },
)

/** Borrar una evaluación registrada por error, con el motivo (queda en auditoría). */
export const eliminarEvaluacion = accion(
  { modulo: 'evaluaciones', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se anula.').max(300) }) },
  async (d) => {
    await dbAuditado.evaluacionDesempeno.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'EvaluacionDesempeno', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/evaluaciones')
    return { ok: true }
  },
)

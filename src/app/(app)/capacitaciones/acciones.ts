'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'

export const crearCapacitacion = accion(
  {
    modulo: 'capacitaciones',
    accion: 'CREAR',
    schema: z.object({
      titulo: z.string().trim().min(3).max(150),
      tipo: z.enum(['INDUCCION', 'REINDUCCION', 'FORMACION', 'SST']),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      duracionHoras: z.coerce.number().min(0).optional(),
      facilitador: z.string().max(120).optional(),
      descripcion: z.string().max(500).optional(),
    }),
  },
  async (d) => {
    const c = await dbAuditado.capacitacion.create({
      data: { titulo: d.titulo, tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, duracionHoras: d.duracionHoras ?? null, facilitador: d.facilitador, descripcion: d.descripcion },
    })
    revalidatePath('/capacitaciones')
    return { id: c.id }
  },
)

export const registrarAsistencia = accion(
  {
    modulo: 'capacitaciones',
    accion: 'EDITAR',
    schema: z.object({ capacitacionId: z.uuid(), colaboradorId: z.uuid(), evaluacion: z.coerce.number().min(0).max(100).optional() }),
  },
  async (d) => {
    await dbAuditado.asistenciaCapacitacion.upsert({
      where: { capacitacionId_colaboradorId: { capacitacionId: d.capacitacionId, colaboradorId: d.colaboradorId } },
      create: { capacitacionId: d.capacitacionId, colaboradorId: d.colaboradorId, asistio: true, evaluacion: d.evaluacion ?? null },
      update: { asistio: true, evaluacion: d.evaluacion ?? null },
    })
    revalidatePath(`/capacitaciones/${d.capacitacionId}`)
  },
)

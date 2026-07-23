'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion } from '@/server/accion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { avisar } from '@/server/notificaciones/avisar'

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

/**
 * Convocatoria previa: cita a los colaboradores seleccionados con notificación
 * (app + correo + push). Deja la evidencia de citación — la asistencia a las
 * capacitaciones es obligatoria (RIT arts. 68.7 y 68.27) y la inasistencia
 * injustificada es una prohibición (art. 70.12).
 */
export const convocarCapacitacion = accion(
  {
    modulo: 'capacitaciones',
    accion: 'EDITAR',
    schema: z.object({ capacitacionId: z.uuid(), colaboradorIds: z.array(z.uuid()).min(1).max(500) }),
  },
  async (d) => {
    const c = await prisma.capacitacion.findUniqueOrThrow({ where: { id: d.capacitacionId } })
    const colaboradores = await prisma.colaborador.findMany({
      where: { id: { in: d.colaboradorIds }, usuarioId: { not: null } },
      select: { usuarioId: true },
    })
    for (const col of colaboradores) {
      await avisar(col.usuarioId!, {
        titulo: `Convocatoria: ${c.titulo}`,
        mensaje: `Estás convocado(a) a la capacitación "${c.titulo}" el ${formatFechaISO(c.fecha)}${c.duracionHoras ? ` (${c.duracionHoras}h)` : ''}${c.facilitador ? `, facilita ${c.facilitador}` : ''}. Tu asistencia es obligatoria (RIT art. 68 num. 27); si no puedes asistir, justifícalo con tu jefe.`,
        enlace: '/autoservicio/capacitaciones', llamadoAccion: 'Ver mis capacitaciones', evento: 'capacitacion_convocatoria',
      })
    }
    return { convocados: colaboradores.length }
  },
)

/**
 * Toma de lista tipo checklist: recibe los colaboradores PRESENTES y sincroniza.
 * Crea las asistencias que falten y elimina las desmarcadas que aún no tengan
 * nota (las que ya tienen evaluación se conservan para no perder el registro).
 */
export const guardarAsistencias = accion(
  {
    modulo: 'capacitaciones',
    accion: 'EDITAR',
    schema: z.object({ capacitacionId: z.uuid(), colaboradorIds: z.array(z.uuid()).max(500) }),
  },
  async (d) => {
    const actuales = await prisma.asistenciaCapacitacion.findMany({ where: { capacitacionId: d.capacitacionId } })
    const marcados = new Set(d.colaboradorIds)
    const nuevos = d.colaboradorIds.filter((id) => !actuales.some((a) => a.colaboradorId === id))
    const quitar = actuales.filter((a) => !marcados.has(a.colaboradorId) && a.evaluacion == null)
    const conNota = actuales.filter((a) => !marcados.has(a.colaboradorId) && a.evaluacion != null).length

    if (nuevos.length > 0) {
      await prisma.asistenciaCapacitacion.createMany({
        data: nuevos.map((colaboradorId) => ({ capacitacionId: d.capacitacionId, colaboradorId, asistio: true })),
        skipDuplicates: true,
      })
    }
    if (quitar.length > 0) {
      await prisma.asistenciaCapacitacion.deleteMany({ where: { id: { in: quitar.map((a) => a.id) } } })
    }
    revalidatePath(`/capacitaciones/${d.capacitacionId}`)
    return { agregados: nuevos.length, quitados: quitar.length, conservadosConNota: conNota }
  },
)

/** Registra o corrige la nota de evaluación de un asistente. */
export const registrarEvaluacionAsistente = accion(
  {
    modulo: 'capacitaciones',
    accion: 'EDITAR',
    schema: z.object({ asistenciaId: z.uuid(), evaluacion: z.coerce.number().min(0).max(100) }),
  },
  async (d) => {
    const a = await dbAuditado.asistenciaCapacitacion.update({ where: { id: d.asistenciaId }, data: { evaluacion: d.evaluacion } })
    revalidatePath(`/capacitaciones/${a.capacitacionId}`)
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

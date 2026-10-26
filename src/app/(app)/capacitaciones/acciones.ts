'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { avisar } from '@/server/notificaciones/avisar'
import { eliminarDocumento } from '@/server/documentos'

const capacitacionSchema = z.object({
  titulo: z.string().trim().min(3).max(150),
  tipo: z.enum(['INDUCCION', 'REINDUCCION', 'FORMACION', 'SST']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duracionHoras: z.coerce.number().min(0).optional(),
  facilitador: z.string().trim().max(120).optional(),
  descripcion: z.string().trim().max(500).optional(),
})

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearCapacitacion = accion(
  { modulo: 'capacitaciones', accion: 'CREAR', schema: capacitacionSchema },
  async (d) => {
    const c = await dbAuditado.capacitacion.create({
      data: { titulo: d.titulo, tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, duracionHoras: d.duracionHoras ?? null, facilitador: v(d.facilitador), descripcion: v(d.descripcion) },
    })
    revalidatePath('/capacitaciones')
    return { id: c.id }
  },
)

/** Corregir los datos de una capacitación (título, tipo, fecha, duración, facilitador, descripción). */
export const editarCapacitacion = accion(
  { modulo: 'capacitaciones', accion: 'EDITAR', schema: capacitacionSchema.extend({ id: z.uuid() }) },
  async (d) => {
    await dbAuditado.capacitacion.update({
      where: { id: d.id },
      data: { titulo: d.titulo, tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, duracionHoras: d.duracionHoras ?? null, facilitador: v(d.facilitador), descripcion: v(d.descripcion) },
    })
    revalidatePath('/capacitaciones')
    revalidatePath(`/capacitaciones/${d.id}`)
    return { ok: true }
  },
)

/**
 * Borrar una capacitación creada por error, con el motivo (queda en auditoría).
 * Se van con ella las asistencias (cascada) y la evidencia adjunta.
 */
export const eliminarCapacitacion = accion(
  { modulo: 'capacitaciones', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se anula.').max(300) }) },
  async (d) => {
    const documentos = await prisma.documento.findMany({ where: { entidadTipo: 'Capacitacion', entidadId: d.id }, select: { id: true } })
    await dbAuditado.capacitacion.delete({ where: { id: d.id } })
    for (const doc of documentos) await eliminarDocumento(doc.id).catch(() => {})
    await auditar('ELIMINAR', 'Capacitacion', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/capacitaciones')
    return { ok: true }
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
        titulo: `Capacitación: ${c.titulo}`,
        mensaje: `${fechaBreve(c.fecha)}${c.duracionHoras ? ` · ${c.duracionHoras} h` : ''}${c.facilitador ? ` · ${c.facilitador}` : ''} · Asistencia obligatoria (RIT art. 68).`,
        enlace: '/autoservicio/capacitaciones', llamadoAccion: 'Ver mis capacitaciones', evento: 'capacitacion_convocatoria',
      })
    }
    return { convocados: colaboradores.length }
  },
)

/**
 * Toma de lista tipo checklist: recibe los colaboradores PRESENTES y sincroniza.
 * Crea las asistencias que falten y elimina las desmarcadas que aún no tengan
 * nota (las que ya tienen evaluación se conservan para no perder el registro;
 * se quitan una a una con `quitarAsistente`).
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

/** Quita a un asistente de la lista, aunque ya tenga nota (se marcó por error). */
export const quitarAsistente = accion(
  { modulo: 'capacitaciones', accion: 'EDITAR', schema: z.object({ asistenciaId: z.uuid() }) },
  async (d) => {
    const a = await dbAuditado.asistenciaCapacitacion.delete({ where: { id: d.asistenciaId } })
    revalidatePath(`/capacitaciones/${a.capacitacionId}`)
    return { ok: true }
  },
)

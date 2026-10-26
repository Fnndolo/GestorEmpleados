'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { validarDias } from '@/lib/horarios'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { asignarHorario, cancelarCambioProgramado, importarDeAsistencia, vistaPreviaComunicacion, editarAsignacion, anularAsignacion } from '@/server/horarios'
import { guardarCronograma, publicarCronograma, avisosDelCronograma } from '@/server/cronograma'
import { auditar } from '@/lib/auditoria'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const motivo = z.string().trim().min(5, 'Explica por qué se anula.').max(300)

function refrescar(colaboradorId?: string) {
  revalidatePath('/horarios')
  if (colaboradorId) revalidatePath(`/colaboradores/${colaboradorId}`)
}

/**
 * Crea o edita una plantilla de horario. Si se edita una que ya tiene gente,
 * se puede aplicar el cambio a esas personas desde una fecha (cada una recibe
 * su asignación nueva, y si se pide, su comunicación).
 */
export const guardarHorario = accion(
  {
    modulo: 'horarios',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid().optional(),
      nombre: z.string().trim().min(2, 'Ponle un nombre al horario.').max(80),
      descripcion: z.string().trim().max(200).optional(),
      dias: z.unknown(),
      aplicar: z.object({ desde: fecha, enviarComunicacion: z.boolean() }).optional(),
    }),
  },
  async (d, usuario) => {
    const v = validarDias(d.dias)
    if ('error' in v) throw new ErrorNegocio(v.error)
    const repetido = await prisma.horario.findFirst({ where: { nombre: { equals: d.nombre, mode: 'insensitive' }, ...(d.id ? { NOT: { id: d.id } } : {}) } })
    if (repetido) throw new ErrorNegocio(`Ya hay un horario llamado «${repetido.nombre}».`)

    const horario = d.id
      ? await dbAuditado.horario.update({ where: { id: d.id }, data: { nombre: d.nombre, descripcion: d.descripcion || null, dias: v.dias } })
      : await dbAuditado.horario.create({ data: { nombre: d.nombre, descripcion: d.descripcion || null, dias: v.dias } })

    let aplicados = 0
    const sinAsistencia: string[] = []
    if (d.id && d.aplicar) {
      const desde = parseFechaISO(d.aplicar.desde)!
      // Quienes lo tienen hoy (o lo tendrán): su última asignación sale de esta plantilla.
      const ultimas = await prisma.asignacionHorario.findMany({
        where: { hasta: null, horarioId: d.id },
        select: { colaboradorId: true, colaborador: { select: { nombres: true, apellidos: true } } },
      })
      for (const u of ultimas) {
        const r = await asignarHorario({
          colaboradorId: u.colaboradorId, horarioId: d.id, desde, motivo: `Cambio del horario «${d.nombre}»`,
          enviarComunicacion: d.aplicar.enviarComunicacion, usuarioId: usuario.id,
        })
        aplicados++
        if (typeof r.asistencia === 'object') sinAsistencia.push(`${u.colaborador.nombres} ${u.colaborador.apellidos}`)
      }
    }
    refrescar()
    return { id: horario.id, aplicados, sinAsistencia }
  },
)

/** Activa o desactiva una plantilla (una desactivada no se puede asignar). */
export const activarHorario = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activo: z.boolean() }) },
  async (d) => {
    await dbAuditado.horario.update({ where: { id: d.id }, data: { activo: d.activo } })
    refrescar()
    return { ok: true }
  },
)

/**
 * Borra una plantilla, con el motivo (queda en auditoría). Si alguien la tiene
 * vigente o programada no se borra (desactívala); las asignaciones pasadas
 * conservan su copia de los días y solo pierden el enlace a la plantilla.
 */
export const eliminarHorario = accion(
  { modulo: 'horarios', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo }) },
  async (d) => {
    const vigentes = await prisma.asignacionHorario.count({ where: { horarioId: d.id, OR: [{ hasta: null }, { hasta: { gte: hoyBogota() } }] } })
    if (vigentes > 0) throw new ErrorNegocio(`No se puede eliminar: ${vigentes} persona${vigentes === 1 ? ' lo tiene' : 's lo tienen'} vigente o programado. Desactívalo en vez de borrarlo.`)
    await dbAuditado.horario.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'Horario', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    refrescar()
    return { ok: true }
  },
)

/** Corrige desde cuándo rige una asignación (vigente o pasada) y su motivo. */
export const editarAsignacionHorario = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ asignacionId: z.uuid(), desde: fecha, motivo: z.string().trim().max(300).optional() }) },
  async (d) => {
    const a = await prisma.asignacionHorario.findUniqueOrThrow({ where: { id: d.asignacionId }, select: { colaboradorId: true } })
    await editarAsignacion({ asignacionId: d.asignacionId, desde: parseFechaISO(d.desde)!, motivo: d.motivo || null })
    refrescar(a.colaboradorId)
    return { ok: true }
  },
)

/** Anula una asignación registrada por error, con el motivo: vuelve a regir la anterior. */
export const anularAsignacionHorario = accion(
  { modulo: 'horarios', accion: 'ELIMINAR', schema: z.object({ asignacionId: z.uuid(), motivo }) },
  async (d) => {
    const a = await prisma.asignacionHorario.findUniqueOrThrow({ where: { id: d.asignacionId }, select: { colaboradorId: true } })
    await anularAsignacion({ asignacionId: d.asignacionId, motivo: d.motivo })
    refrescar(a.colaboradorId)
    return { ok: true }
  },
)

/** Le asigna un horario a una persona desde una fecha (con su comunicación, si se pide). */
export const asignarHorarioColaborador = accion(
  {
    modulo: 'horarios',
    accion: 'EDITAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      horarioId: z.union([z.uuid(), z.literal('')]),
      dias: z.unknown().optional(),
      desde: fecha,
      motivo: z.string().trim().max(300).optional(),
      enviarComunicacion: z.boolean(),
    }),
  },
  async (d, usuario) => {
    const r = await asignarHorario({
      colaboradorId: d.colaboradorId, horarioId: d.horarioId || null, dias: d.dias,
      desde: parseFechaISO(d.desde)!, motivo: d.motivo || null, enviarComunicacion: d.enviarComunicacion, usuarioId: usuario.id,
    })
    refrescar(d.colaboradorId)
    return {
      asistencia: typeof r.asistencia === 'object' ? 'error' : r.asistencia,
      errorAsistencia: typeof r.asistencia === 'object' ? r.asistencia.error : null,
      documentoId: r.documentoId,
    }
  },
)

/** Deshace un cambio de horario que todavía no empieza. */
export const cancelarCambioHorario = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ asignacionId: z.uuid() }) },
  async (d) => {
    const a = await prisma.asignacionHorario.findUniqueOrThrow({ where: { id: d.asignacionId }, select: { colaboradorId: true } })
    await cancelarCambioProgramado(d.asignacionId)
    refrescar(a.colaboradorId)
    return { ok: true }
  },
)

/** Trae de AsistencIA las plantillas y el horario de cada persona. */
export const importarHorariosAsistencia = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ colaboradorId: z.uuid().optional() }) },
  async (d, usuario) => {
    const r = await importarDeAsistencia(usuario.id, d.colaboradorId)
    refrescar(d.colaboradorId)
    return r
  },
)

/** La comunicación del cambio tal como saldría (PDF en base64), sin asignar nada. */
export const previsualizarCambioHorario = accion(
  {
    modulo: 'horarios',
    accion: 'EDITAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      horarioId: z.union([z.uuid(), z.literal('')]),
      dias: z.unknown().optional(),
      desde: fecha,
      motivo: z.string().trim().max(300).optional(),
    }),
  },
  async (d) => {
    const pdf = await vistaPreviaComunicacion({ colaboradorId: d.colaboradorId, horarioId: d.horarioId || null, dias: d.dias, desde: parseFechaISO(d.desde)!, motivo: d.motivo || null })
    return { pdf: pdf.toString('base64') }
  },
)

const mes = z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido')

/** Guarda el cronograma de domingos y festivos de un mes en una sede. */
export const guardarCronogramaMes = accion(
  {
    modulo: 'horarios',
    accion: 'EDITAR',
    schema: z.object({ sedeId: z.uuid(), mes, turnos: z.record(z.string(), z.array(fecha)) }),
  },
  async (d, usuario) => {
    // El mes que ya terminó es historia: no se reescribe.
    if (d.mes < hoyBogota().toISOString().slice(0, 7)) throw new ErrorNegocio('Ese mes ya pasó: su cronograma no se puede cambiar.')
    const r = await guardarCronograma({ sedeId: d.sedeId, mes: d.mes, turnos: d.turnos, usuarioId: usuario.id })
    refrescar()
    return r
  },
)

/** Publica el cronograma: le avisa a cada persona sus días (solo a quien le cambiaron). */
/** Lo que le llegaría a cada persona al publicar estos turnos (aún sin guardar), sin avisar a nadie. */
export const previsualizarAvisosCronograma = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ sedeId: z.uuid(), mes, turnos: z.record(z.string(), z.array(z.string())) }) },
  async (d) => avisosDelCronograma(d.sedeId, d.mes, d.turnos),
)

export const publicarCronogramaMes = accion(
  { modulo: 'horarios', accion: 'EDITAR', schema: z.object({ sedeId: z.uuid(), mes }) },
  async (d, usuario) => {
    const r = await publicarCronograma({ sedeId: d.sedeId, mes: d.mes, usuarioId: usuario.id })
    refrescar()
    return r
  },
)

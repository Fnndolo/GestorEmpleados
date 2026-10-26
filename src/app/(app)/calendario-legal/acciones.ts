'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { generarOcurrencias } from '@/server/calendario/generador'
import { resolverVencimiento, cancelarVencimiento, publicarVencimiento } from '@/server/vencimientos/servicio'
import { eliminarDocumento } from '@/server/documentos'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/**
 * Borra las ocurrencias FUTURAS pendientes de una obligación (y resuelve sus
 * alertas). Se usa al editar la regla o desactivarla, para que "Generar
 * próximas fechas" recree las fechas con la regla nueva. Las cumplidas y las
 * pasadas se conservan (historial).
 */
async function limpiarOcurrenciasFuturas(obligacionId: string): Promise<void> {
  const hoy = hoyBogota()
  const futuras = await prisma.ocurrenciaObligacion.findMany({
    where: { obligacionId, estado: 'PENDIENTE', fechaLimite: { gt: hoy } },
    select: { id: true },
  })
  for (const oc of futuras) {
    await resolverVencimiento('OcurrenciaObligacion', oc.id, 'OBLIGACION_LEGAL')
  }
  await prisma.ocurrenciaObligacion.deleteMany({ where: { id: { in: futuras.map((o) => o.id) } } })
}

const obligacionSchema = z.object({
  id: z.uuid().optional(), // presente = editar
  nombre: z.string().trim().min(3).max(200),
  categoria: z.enum(['SOCIETARIO', 'TRIBUTARIO', 'LABORAL', 'HABEAS_DATA', 'COMERCIAL', 'SST', 'CONTRACTUAL']),
  periodicidad: z.enum(['MENSUAL', 'BIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CADA_N_ANIOS', 'POR_EVENTO']),
  diaBase: z.coerce.number().int().min(1).max(31).optional(),
  mesBase: z.coerce.number().int().min(1).max(12).optional(),
  mesesBase: z.string().regex(/^\d{1,2}(\s*,\s*\d{1,2})*$/, 'Meses separados por coma, ej. 6,12').optional().or(z.literal('')),
  cadaNAnios: z.coerce.number().int().min(1).max(50).optional(),
  porSede: z.boolean().optional(),
  responsableRol: z.string().trim().max(60).optional().or(z.literal('')),
  fuenteLegal: z.string().trim().max(200).optional().or(z.literal('')),
  descripcion: z.string().trim().max(500).optional().or(z.literal('')),
})

/** Crea o edita una obligación del catálogo. Al editar, limpia las fechas futuras pendientes. */
export const guardarObligacion = accion(
  { modulo: 'calendario_legal', accion: 'CREAR', schema: obligacionSchema },
  async (d) => {
    const data = {
      nombre: d.nombre,
      categoria: d.categoria,
      periodicidad: d.periodicidad,
      diaBase: d.diaBase ?? null,
      mesBase: d.mesBase ?? null,
      mesesBase: v(d.mesesBase),
      cadaNAnios: d.periodicidad === 'CADA_N_ANIOS' ? d.cadaNAnios ?? null : null,
      porSede: d.porSede ?? false,
      responsableRol: v(d.responsableRol),
      fuenteLegal: v(d.fuenteLegal),
      descripcion: v(d.descripcion),
    }
    if (d.id) {
      await dbAuditado.obligacionLegal.update({ where: { id: d.id }, data })
      await limpiarOcurrenciasFuturas(d.id)
    } else {
      await dbAuditado.obligacionLegal.create({ data })
    }
    revalidatePath('/calendario-legal')
    revalidatePath('/calendario-legal/obligaciones')
    return { ok: true }
  },
)

/** Activa o desactiva una obligación. Al desactivar, limpia las fechas futuras pendientes. */
export const cambiarActivaObligacion = accion(
  { modulo: 'calendario_legal', accion: 'EDITAR', schema: z.object({ id: z.uuid(), activa: z.boolean() }) },
  async (d) => {
    await dbAuditado.obligacionLegal.update({ where: { id: d.id }, data: { activa: d.activa } })
    if (!d.activa) await limpiarOcurrenciasFuturas(d.id)
    revalidatePath('/calendario-legal')
    revalidatePath('/calendario-legal/obligaciones')
    return { ok: true }
  },
)

export const completarOcurrencia = accion(
  { modulo: 'calendario_legal', accion: 'EDITAR', schema: z.object({ id: z.uuid(), observaciones: z.string().max(500).optional() }) },
  async ({ id, observaciones }) => {
    await dbAuditado.ocurrenciaObligacion.update({
      where: { id },
      data: { estado: 'CUMPLIDA', fechaCumplido: hoyBogota(), observaciones },
    })
    await resolverVencimiento('OcurrenciaObligacion', id, 'OBLIGACION_LEGAL')
    revalidatePath('/calendario-legal')
  },
)

/**
 * Deshace un "cumplida" marcado por error: la fecha vuelve a pendiente, se
 * borra el soporte si lo había y la alerta de vencimiento vuelve a correr.
 */
export const revertirOcurrencia = accion(
  { modulo: 'calendario_legal', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const oc = await prisma.ocurrenciaObligacion.findUniqueOrThrow({ where: { id }, include: { obligacion: true } })
    if (oc.estado !== 'CUMPLIDA') throw new ErrorNegocio('Esta fecha no está marcada como cumplida.')
    await dbAuditado.ocurrenciaObligacion.update({
      where: { id },
      data: { estado: 'PENDIENTE', fechaCumplido: null, observaciones: null, evidenciaDocId: null },
    })
    if (oc.evidenciaDocId) await eliminarDocumento(oc.evidenciaDocId).catch(() => {})
    // Misma publicación que hace el generador, para que vuelva a alertar.
    const sede = oc.sedeId ? await prisma.sede.findUnique({ where: { id: oc.sedeId }, select: { nombre: true } }) : null
    await publicarVencimiento({
      origen: 'OBLIGACION_LEGAL',
      entidadTipo: 'OcurrenciaObligacion',
      entidadId: id,
      titulo: `${oc.obligacion.nombre}${sede?.nombre ? ` — ${sede.nombre}` : ''}`,
      detalle: oc.obligacion.fuenteLegal,
      fechaVencimientoISO: formatFechaISO(oc.fechaLimite),
      sedeId: oc.sedeId,
      responsables: oc.obligacion.responsableRol ? [{ rol: oc.obligacion.responsableRol }] : undefined,
    })
    revalidatePath('/calendario-legal')
    return { ok: true }
  },
)

/**
 * Elimina una obligación del catálogo (creada por error o que ya no aplica),
 * con el motivo en auditoría. Se van con ella todas sus fechas —cumplidas y
 * pendientes—, sus alertas y los soportes de cumplimiento. Si solo se quiere
 * dejar de generar fechas nuevas, lo correcto es desactivarla.
 */
export const eliminarObligacion = accion(
  { modulo: 'calendario_legal', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se elimina.').max(300) }) },
  async (d) => {
    const o = await prisma.obligacionLegal.findUniqueOrThrow({ where: { id: d.id }, include: { ocurrencias: { select: { id: true, evidenciaDocId: true } } } })
    await auditar('ELIMINAR', 'ObligacionLegal', { registroId: d.id, descripcion: `Anulado: ${d.motivo} · "${o.nombre}" (${o.categoria}, ${o.ocurrencias.length} fecha(s))` })
    for (const oc of o.ocurrencias) await cancelarVencimiento('OcurrenciaObligacion', oc.id, 'OBLIGACION_LEGAL')
    // Las ocurrencias caen en cascada (onDelete: Cascade).
    await dbAuditado.obligacionLegal.delete({ where: { id: d.id } })
    for (const oc of o.ocurrencias) if (oc.evidenciaDocId) await eliminarDocumento(oc.evidenciaDocId).catch(() => {})
    revalidatePath('/calendario-legal')
    revalidatePath('/calendario-legal/obligaciones')
    return { ok: true }
  },
)

export const generarCalendario = accion(
  { modulo: 'calendario_legal', accion: 'CREAR', schema: z.object({}) },
  async () => {
    const r = await generarOcurrencias(120)
    revalidatePath('/calendario-legal')
    return r
  },
)

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { generarOcurrencias } from '@/server/calendario/generador'
import { resolverVencimiento } from '@/server/vencimientos/servicio'
import { hoyBogota } from '@/lib/fechas'

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

export const generarCalendario = accion(
  { modulo: 'calendario_legal', accion: 'CREAR', schema: z.object({}) },
  async () => {
    const r = await generarOcurrencias(120)
    revalidatePath('/calendario-legal')
    return r
  },
)

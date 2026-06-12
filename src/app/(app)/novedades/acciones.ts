'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import {
  incapacidadSchema, licenciaSchema, permisoSchema, vacacionesSchema, bonificacionSchema,
} from '@/lib/validaciones/novedades'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { esDiaHabil } from '@/lib/dias-habiles'
import { cargarFestivos } from '@/server/vencimientos/festivos'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

function diasCalendario(ini: string, fin: string): number {
  const a = parseFechaISO(ini)!, b = parseFechaISO(fin)!
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1
}

/** Cuenta días hábiles en [ini, fin] inclusive. */
export async function diasHabilesRango(ini: string, fin: string): Promise<number> {
  const a = parseFechaISO(ini)!, b = parseFechaISO(fin)!
  const empresa = await prisma.configuracionEmpresa.findFirst()
  const festivos = await cargarFestivos(a.getUTCFullYear() - 1, b.getUTCFullYear() + 1)
  let n = 0
  const d = new Date(a)
  while (d <= b) {
    if (esDiaHabil(d, festivos, empresa?.sabadoHabil ?? true)) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

export const registrarIncapacidad = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: incapacidadSchema },
  async (d) => {
    if (parseFechaISO(d.fechaFin)! < parseFechaISO(d.fechaInicio)!) throw new ErrorNegocio('La fecha de fin no puede ser anterior al inicio.')
    await dbAuditado.incapacidad.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        dias: diasCalendario(d.fechaInicio, d.fechaFin),
        diagnosticoCie10: v(d.diagnosticoCie10), entidad: v(d.entidad),
        esProrroga: d.esProrroga, observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

export const registrarLicencia = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: licenciaSchema },
  async (d) => {
    await dbAuditado.licencia.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        dias: diasCalendario(d.fechaInicio, d.fechaFin),
        remunerada: d.remunerada, observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

export const registrarPermiso = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: permisoSchema },
  async (d) => {
    await dbAuditado.permiso.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!,
        horas: d.diaCompleto ? null : d.horas ?? null, diaCompleto: d.diaCompleto,
        motivo: d.motivo, remunerado: d.remunerado,
      },
    })
    revalidatePath('/novedades')
  },
)

export const registrarVacaciones = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: vacacionesSchema },
  async (d) => {
    const dias = await diasHabilesRango(d.fechaInicio, d.fechaFin)
    await dbAuditado.vacaciones.create({
      data: {
        colaboradorId: d.colaboradorId,
        fechaInicio: parseFechaISO(d.fechaInicio)!, fechaFin: parseFechaISO(d.fechaFin)!,
        diasHabiles: dias, estado: 'APROBADA', observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
    return { dias }
  },
)

export const registrarBonificacion = accion(
  { modulo: 'novedades', accion: 'CREAR', schema: bonificacionSchema },
  async (d) => {
    await dbAuditado.bonificacion.create({
      data: {
        colaboradorId: d.colaboradorId, concepto: d.concepto, valor: d.valor,
        constitutivoSalario: d.constitutivoSalario, estadoPago: 'PENDIENTE',
        observaciones: v(d.observaciones),
      },
    })
    revalidatePath('/novedades')
  },
)

export const marcarBonificacionPagada = accion(
  { modulo: 'novedades', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.bonificacion.update({
      where: { id },
      data: { estadoPago: 'PAGADO', fechaPago: hoyBogota() },
    })
    revalidatePath('/novedades')
  },
)

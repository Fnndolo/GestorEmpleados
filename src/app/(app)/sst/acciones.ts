'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { publicarVencimiento } from '@/server/vencimientos/servicio'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearComite = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({ tipo: z.enum(['VIGIA_SST', 'COPASST', 'CONVIVENCIA']), fechaConformacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    const inicio = parseFechaISO(d.fechaConformacion)!
    const vence = new Date(inicio); vence.setUTCFullYear(vence.getUTCFullYear() + 2)
    const c = await dbAuditado.comite.create({ data: { tipo: d.tipo, fechaConformacion: inicio, vigenciaHasta: vence, activo: true } })
    // Vencimiento de renovación a 2 años
    await publicarVencimiento({
      origen: 'COMITE', entidadTipo: 'Comite', entidadId: c.id,
      titulo: `Renovación ${d.tipo === 'CONVIVENCIA' ? 'Comité de Convivencia' : d.tipo}`,
      fechaVencimientoISO: vence.toISOString().slice(0, 10), responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
    return { id: c.id }
  },
)

export const registrarReunionComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ comiteId: z.uuid(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), temas: z.string().min(3).max(1000), compromisos: z.string().max(1000).optional() }) },
  async (d) => {
    await dbAuditado.reunionComite.create({ data: { comiteId: d.comiteId, fecha: parseFechaISO(d.fecha)!, temas: d.temas, compromisos: v(d.compromisos) } })
    revalidatePath('/sst')
  },
)

export const crearExamenMedico = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['INGRESO', 'PERIODICO', 'EGRESO', 'POST_INCAPACIDAD']),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
      concepto: z.enum(['APTO', 'APTO_CON_RECOMENDACIONES', 'NO_APTO', 'APLAZADO']),
      recomendaciones: z.string().max(1000).optional(),
      restricciones: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { sedeId: true, nombres: true, apellidos: true } })
    const examen = await dbAuditado.examenMedico.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo, fecha: parseFechaISO(d.fecha)!,
        fechaVencimiento: parseFechaISO(d.fechaVencimiento || null), concepto: d.concepto,
        recomendaciones: v(d.recomendaciones), restricciones: v(d.restricciones),
      },
    })
    // Examen periódico con vencimiento → alerta
    if (d.fechaVencimiento) {
      await publicarVencimiento({
        origen: 'EXAMEN_MEDICO', entidadTipo: 'ExamenMedico', entidadId: examen.id,
        titulo: `Examen médico por vencer — ${colab.nombres} ${colab.apellidos}`,
        fechaVencimientoISO: d.fechaVencimiento, sedeId: colab.sedeId, responsables: [{ rol: 'Responsable SST' }],
      })
    }
    revalidatePath('/sst')
  },
)

export const reportarAccidente = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({ colaboradorId: z.uuid(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descripcion: z.string().min(5).max(1000), parteCuerpo: z.string().max(120).optional(), diasIncapacidad: z.coerce.number().int().min(0).optional() }),
  },
  async (d) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { sedeId: true, nombres: true, apellidos: true } })
    const acc = await dbAuditado.accidenteTrabajo.create({
      data: { colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, sedeId: colab.sedeId, descripcion: d.descripcion, parteCuerpo: v(d.parteCuerpo), diasIncapacidad: d.diasIncapacidad ?? null, estado: 'REPORTADO' },
    })
    // FURAT: reportar a la ARL dentro de 2 días hábiles
    const limite = new Date(parseFechaISO(d.fecha)!); limite.setUTCDate(limite.getUTCDate() + 2)
    await publicarVencimiento({
      origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccidenteTrabajo', entidadId: acc.id,
      titulo: `Reporte FURAT pendiente — ${colab.nombres} ${colab.apellidos}`,
      fechaVencimientoISO: limite.toISOString().slice(0, 10), sedeId: colab.sedeId, responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
  },
)

export const crearEpp = accion(
  { modulo: 'sst', accion: 'CREAR', schema: z.object({ nombre: z.string().min(2).max(120), vidaUtilMeses: z.coerce.number().int().min(0).optional() }) },
  async (d) => {
    await dbAuditado.elementoEpp.upsert({ where: { nombre: d.nombre }, create: { nombre: d.nombre, vidaUtilMeses: d.vidaUtilMeses ?? null }, update: {} })
    revalidatePath('/sst')
  },
)

export const entregarEpp = accion(
  { modulo: 'sst', accion: 'CREAR', schema: z.object({ elementoEppId: z.uuid(), colaboradorId: z.uuid(), cantidad: z.coerce.number().int().min(1), fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reposicion: z.boolean() }) },
  async (d) => {
    await dbAuditado.entregaEpp.create({ data: { elementoEppId: d.elementoEppId, colaboradorId: d.colaboradorId, cantidad: d.cantidad, fechaEntrega: parseFechaISO(d.fechaEntrega)!, reposicion: d.reposicion } })
    revalidatePath('/sst')
  },
)

export const registrarAutoevaluacion = accion(
  { modulo: 'sst', accion: 'CREAR', schema: z.object({ anio: z.coerce.number().int(), puntaje: z.coerce.number().min(0).max(100), nivelEstandar: z.coerce.number().int(), planMejora: z.string().max(2000).optional() }) },
  async (d) => {
    await dbAuditado.autoevaluacionSst.upsert({
      where: { anio: d.anio },
      create: { anio: d.anio, puntaje: d.puntaje, nivelEstandar: d.nivelEstandar, planMejora: v(d.planMejora) },
      update: { puntaje: d.puntaje, nivelEstandar: d.nivelEstandar, planMejora: v(d.planMejora) },
    })
    revalidatePath('/sst')
  },
)

export const crearPeligro = accion(
  { modulo: 'sst', accion: 'CREAR', schema: z.object({ proceso: z.string().min(2).max(120), peligro: z.string().min(2).max(200), riesgo: z.string().min(2).max(200), nivel: z.enum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']), controles: z.string().max(500).optional(), sedeId: z.union([z.uuid(), z.literal('')]).optional() }) },
  async (d) => {
    await dbAuditado.peligroIpevr.create({ data: { proceso: d.proceso, peligro: d.peligro, riesgo: d.riesgo, nivel: d.nivel, controles: v(d.controles), sedeId: v(d.sedeId) } })
    revalidatePath('/sst')
  },
)

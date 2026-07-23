'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { publicarVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'
import { generarRecibidoEpp } from '@/server/epp'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/**
 * Registra (o corrige) el indicador mensual de accidentalidad/ausentismo.
 * numTrabajadores/horasHombre/diasAusentismo los digita RRHH (no hay una única
 * fuente automática de ausentismo); accidentes y días perdidos se calculan del
 * mismo mes en AccidenteTrabajo para no duplicar el dato ya reportado.
 */
export const guardarIndicadorSst = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      anio: z.coerce.number().int().min(2000), mes: z.coerce.number().int().min(1).max(12),
      numTrabajadores: z.coerce.number().int().min(0), horasHombre: z.coerce.number().min(0), diasAusentismo: z.coerce.number().int().min(0),
    }),
  },
  async (d) => {
    const desde = new Date(Date.UTC(d.anio, d.mes - 1, 1))
    const hasta = new Date(Date.UTC(d.anio, d.mes, 1))
    const accidentesMes = await prisma.accidenteTrabajo.findMany({ where: { fecha: { gte: desde, lt: hasta }, esIncidente: false }, select: { diasIncapacidad: true } })
    const numAccidentes = accidentesMes.length
    const diasPerdidos = accidentesMes.reduce((acc, a) => acc + (a.diasIncapacidad ?? 0), 0)
    await dbAuditado.indicadorSst.upsert({
      where: { anio_mes: { anio: d.anio, mes: d.mes } },
      create: { anio: d.anio, mes: d.mes, numTrabajadores: d.numTrabajadores, horasHombre: d.horasHombre, diasAusentismo: d.diasAusentismo, numAccidentes, diasPerdidos },
      update: { numTrabajadores: d.numTrabajadores, horasHombre: d.horasHombre, diasAusentismo: d.diasAusentismo, numAccidentes, diasPerdidos },
    })
    revalidatePath('/sst')
  },
)

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
    const r = await dbAuditado.reunionComite.create({ data: { comiteId: d.comiteId, fecha: parseFechaISO(d.fecha)!, temas: d.temas, compromisos: v(d.compromisos) } })
    revalidatePath('/sst')
    return { id: r.id }
  },
)

/** Vincula el acta (PDF/foto) ya subida a una reunión de comité registrada. */
export const vincularActaReunion = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ reunionId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.reunionComite.update({ where: { id: d.reunionId }, data: { actaDocId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const agregarMiembroComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ comiteId: z.uuid(), colaboradorId: z.uuid(), rol: z.string().min(2).max(60), porEmpleador: z.boolean() }) },
  async (d) => {
    await dbAuditado.miembroComite.create({ data: { comiteId: d.comiteId, colaboradorId: d.colaboradorId, rol: d.rol, porEmpleador: d.porEmpleador } })
    revalidatePath('/sst')
  },
)

export const eliminarMiembroComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    await dbAuditado.miembroComite.delete({ where: { id: d.id } })
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
    return { id: examen.id }
  },
)

/** Vincula el certificado (soporte) ya subido a un examen médico registrado. */
export const vincularSoporteExamen = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ examenId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.examenMedico.update({ where: { id: d.examenId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const reportarAccidente = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({ colaboradorId: z.uuid(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descripcion: z.string().min(5).max(1000), parteCuerpo: z.string().max(120).optional(), diasIncapacidad: z.coerce.number().int().min(0).optional(), esIncidente: z.boolean().optional() }),
  },
  async (d) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { sedeId: true, nombres: true, apellidos: true } })
    const esIncidente = d.esIncidente ?? false
    const acc = await dbAuditado.accidenteTrabajo.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, sedeId: colab.sedeId, descripcion: d.descripcion,
        parteCuerpo: v(d.parteCuerpo), diasIncapacidad: d.diasIncapacidad ?? null, estado: 'REPORTADO',
        // Incidente (sin lesión): se investiga, pero no se reporta a la ARL.
        esIncidente, furatReportado: esIncidente,
      },
    })
    if (!esIncidente) {
      // FURAT: reportar a la ARL dentro de 2 días hábiles
      const limite = new Date(parseFechaISO(d.fecha)!); limite.setUTCDate(limite.getUTCDate() + 2)
      await publicarVencimiento({
        origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccidenteTrabajo', entidadId: acc.id,
        titulo: `Reporte FURAT pendiente — ${colab.nombres} ${colab.apellidos}`,
        fechaVencimientoISO: limite.toISOString().slice(0, 10), sedeId: colab.sedeId, responsables: [{ rol: 'Responsable SST' }],
      })
    }
    revalidatePath('/sst')
  },
)

/** Seguimiento del accidente: cambio de estado, notas de investigación, confirmar reporte FURAT a la ARL. */
export const actualizarAccidente = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      estado: z.enum(['REPORTADO', 'EN_INVESTIGACION', 'CERRADO']),
      investigacion: z.string().max(2000).optional(),
      furatReportado: z.boolean(),
      diasIncapacidad: z.coerce.number().int().min(0).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.accidenteTrabajo.update({
      where: { id: d.id },
      data: { estado: d.estado, investigacion: v(d.investigacion), furatReportado: d.furatReportado, diasIncapacidad: d.diasIncapacidad ?? null },
    })
    // Ya se reportó a la ARL: cancela la alerta de "FURAT pendiente".
    if (d.furatReportado) await cancelarVencimiento('AccidenteTrabajo', d.id, 'ACCION_CORRECTIVA')
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
  async (d, usuario) => {
    const entrega = await dbAuditado.entregaEpp.create({ data: { elementoEppId: d.elementoEppId, colaboradorId: d.colaboradorId, cantidad: d.cantidad, fechaEntrega: parseFechaISO(d.fechaEntrega)!, reposicion: d.reposicion } })
    // Constancia en PDF (D.1072/2015 art. 2.2.4.6.24); el colaborador la firma desde su autoservicio.
    await generarRecibidoEpp(entrega.id, usuario.id)
    const usuarioColab = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioColab) {
      await avisar(usuarioColab, {
        titulo: 'Firma el recibido de tus EPP',
        mensaje: 'Se registró la entrega de tus elementos de protección personal. Entra a tu autoservicio para firmar la constancia de recibido.',
        enlace: '/autoservicio/dotacion', llamadoAccion: 'Firmar el recibido', evento: 'epp_entregado',
      })
    }
    revalidatePath('/sst')
  },
)

/**
 * El colaborador firma digitalmente el recibido de SUS EPP desde autoservicio.
 * Regenera el PDF con la firma incrustada y deja la constancia (firmadoEn).
 */
export const firmarRecibidoEpp = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ entregaId: z.uuid(), firmaDataUri: z.string().min(50) }),
  },
  async (d, usuario) => {
    const entrega = await prisma.entregaEpp.findUniqueOrThrow({ where: { id: d.entregaId } })
    if (entrega.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('Esta entrega de EPP no es tuya.')
    if (entrega.firmadoEn) throw new ErrorNegocio('Este recibido ya está firmado.')
    const docId = await generarRecibidoEpp(d.entregaId, usuario.id, { dataUri: d.firmaDataUri, fecha: new Date() })
    revalidatePath('/autoservicio/dotacion')
    revalidatePath('/sst')
    return { docId }
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
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      proceso: z.string().min(2).max(120), peligro: z.string().min(2).max(200), riesgo: z.string().min(2).max(200),
      nivel: z.enum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']), controles: z.string().max(500).optional(),
      sedeId: z.union([z.uuid(), z.literal('')]).optional(), rutinaria: z.boolean(),
      controlFuente: z.string().max(300).optional(), controlMedio: z.string().max(300).optional(), controlIndividuo: z.string().max(300).optional(),
      responsable: z.string().max(120).optional(), fechaRevision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    await dbAuditado.peligroIpevr.create({
      data: {
        proceso: d.proceso, peligro: d.peligro, riesgo: d.riesgo, nivel: d.nivel, controles: v(d.controles), sedeId: v(d.sedeId),
        rutinaria: d.rutinaria, controlFuente: v(d.controlFuente), controlMedio: v(d.controlMedio), controlIndividuo: v(d.controlIndividuo),
        responsable: v(d.responsable), fechaRevision: parseFechaISO(d.fechaRevision || null),
      },
    })
    revalidatePath('/sst')
  },
)

export const guardarProfesiograma = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      cargoId: z.uuid(), riesgosExpuestos: z.string().min(2).max(1000), examenesRequeridos: z.string().min(2).max(1000),
      aptitudesRequeridas: z.string().min(2).max(1000), restricciones: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.profesiograma.upsert({
      where: { cargoId: d.cargoId },
      create: { cargoId: d.cargoId, riesgosExpuestos: d.riesgosExpuestos, examenesRequeridos: d.examenesRequeridos, aptitudesRequeridas: d.aptitudesRequeridas, restricciones: v(d.restricciones) },
      update: { riesgosExpuestos: d.riesgosExpuestos, examenesRequeridos: d.examenesRequeridos, aptitudesRequeridas: d.aptitudesRequeridas, restricciones: v(d.restricciones) },
    })
    revalidatePath('/sst')
  },
)

export const crearPlanEmergencia = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      sedeId: z.union([z.uuid(), z.literal('')]).optional(), version: z.string().min(1).max(40),
      vigenciaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vigenciaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async (d) => {
    const plan = await dbAuditado.planEmergencia.create({
      data: { sedeId: v(d.sedeId), version: d.version, vigenciaDesde: parseFechaISO(d.vigenciaDesde)!, vigenciaHasta: parseFechaISO(d.vigenciaHasta)!, activo: true },
    })
    await publicarVencimiento({
      origen: 'PLAN_EMERGENCIA', entidadTipo: 'PlanEmergencia', entidadId: plan.id,
      titulo: `Actualización del plan de emergencias (v${d.version})`,
      fechaVencimientoISO: d.vigenciaHasta, sedeId: v(d.sedeId), responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
    return { id: plan.id }
  },
)

export const vincularDocumentoPlanEmergencia = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ planId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.planEmergencia.update({ where: { id: d.planId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const agregarBrigadista = accion(
  { modulo: 'sst', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid(), sedeId: z.union([z.uuid(), z.literal('')]).optional(), rol: z.string().min(2).max(60) }) },
  async (d) => {
    await dbAuditado.brigadista.create({ data: { colaboradorId: d.colaboradorId, sedeId: v(d.sedeId), rol: d.rol, activo: true } })
    revalidatePath('/sst')
  },
)

export const eliminarBrigadista = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    await dbAuditado.brigadista.update({ where: { id: d.id }, data: { activo: false } })
    revalidatePath('/sst')
  },
)

export const registrarSimulacro = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      sedeId: z.union([z.uuid(), z.literal('')]).optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tipo: z.string().min(2).max(80),
      participantes: z.coerce.number().int().min(0).optional(), observaciones: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    const s = await dbAuditado.simulacro.create({
      data: { sedeId: v(d.sedeId), fecha: parseFechaISO(d.fecha)!, tipo: d.tipo, participantes: d.participantes ?? null, observaciones: v(d.observaciones) },
    })
    revalidatePath('/sst')
    return { id: s.id }
  },
)

export const vincularDocumentoSimulacro = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ simulacroId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.simulacro.update({ where: { id: d.simulacroId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const registrarInspeccion = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      sedeId: z.union([z.uuid(), z.literal('')]).optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tipo: z.string().min(2).max(80),
      area: z.string().max(120).optional(), hallazgos: z.string().min(2).max(2000), responsable: z.string().max(120).optional(),
    }),
  },
  async (d) => {
    const i = await dbAuditado.inspeccionSst.create({
      data: { sedeId: v(d.sedeId), fecha: parseFechaISO(d.fecha)!, tipo: d.tipo, area: v(d.area), hallazgos: d.hallazgos, responsable: v(d.responsable), estado: 'ABIERTA' },
    })
    revalidatePath('/sst')
    return { id: i.id }
  },
)

export const vincularDocumentoInspeccion = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ inspeccionId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.inspeccionSst.update({ where: { id: d.inspeccionId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const cerrarInspeccion = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), fechaCierre: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) },
  async (d) => {
    await dbAuditado.inspeccionSst.update({ where: { id: d.id }, data: { estado: 'CERRADA', fechaCierre: parseFechaISO(d.fechaCierre)! } })
    revalidatePath('/sst')
  },
)

// ── Estructura del SG-SST (D.1072 art. 2.2.4.6.8) ──────────────────────────

/** Designa al responsable del SG-SST; desactiva la designación anterior (histórico). */
export const designarResponsableSgsst = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(), fechaDesignacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      licenciaSst: z.string().max(60).optional(), cursoHoras: z.coerce.number().int().min(0).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.responsableSgsst.updateMany({ where: { activo: true }, data: { activo: false } })
    const r = await dbAuditado.responsableSgsst.create({
      data: { colaboradorId: d.colaboradorId, fechaDesignacion: parseFechaISO(d.fechaDesignacion)!, licenciaSst: v(d.licenciaSst), cursoHoras: d.cursoHoras ?? null, activo: true },
    })
    revalidatePath('/sst')
    return { id: r.id }
  },
)

/** Vincula la carta de designación firmada al responsable vigente. */
export const vincularCartaResponsable = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ responsableId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.responsableSgsst.update({ where: { id: d.responsableId }, data: { cartaDocId: d.documentoId } })
    revalidatePath('/sst')
  },
)

/** Registra o actualiza el plan de trabajo anual del SG-SST (uno por año). */
export const guardarPlanTrabajoSst = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      anio: z.coerce.number().int().min(2000).max(2100),
      aprobadoPor: z.string().max(120).optional(),
      avancePct: z.coerce.number().int().min(0).max(100),
      notas: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    const p = await dbAuditado.planTrabajoSst.upsert({
      where: { anio: d.anio },
      create: { anio: d.anio, aprobadoPor: v(d.aprobadoPor), avancePct: d.avancePct, notas: v(d.notas) },
      update: { aprobadoPor: v(d.aprobadoPor), avancePct: d.avancePct, notas: v(d.notas) },
    })
    revalidatePath('/sst')
    return { id: p.id }
  },
)

/** Vincula el PDF del plan de trabajo anual. */
export const vincularDocumentoPlanTrabajo = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ planId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.planTrabajoSst.update({ where: { id: d.planId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

/**
 * Marca un documento legal (categoría Política, en Jurídica) como LA política del
 * SG-SST y registra su fecha de firma. Desmarca cualquier otra política SG-SST.
 */
export const marcarPoliticaSgsst = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ documentoLegalId: z.uuid(), firmadaEn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) },
  async (d) => {
    const doc = await prisma.documentoLegal.findUniqueOrThrow({ where: { id: d.documentoLegalId }, select: { categoria: true } })
    if (doc.categoria !== 'POLITICA') throw new ErrorNegocio('El documento seleccionado no es de categoría Política.')
    await dbAuditado.documentoLegal.updateMany({ where: { esSgSst: true }, data: { esSgSst: false } })
    await dbAuditado.documentoLegal.update({ where: { id: d.documentoLegalId }, data: { esSgSst: true, firmadaEn: parseFechaISO(d.firmadaEn)! } })
    revalidatePath('/sst')
    revalidatePath('/juridica')
  },
)

// ── Matriz legal SST (normograma) ──────────────────────────────────────────

export const guardarNormaMatrizLegal = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      id: z.uuid().optional(), // presente = editar
      norma: z.string().min(3).max(200), emisor: z.string().max(120).optional(),
      tema: z.string().min(3).max(300), articulos: z.string().max(200).optional(),
      comoCumple: z.string().max(1000).optional(),
      cumplimiento: z.enum(['CUMPLE', 'PARCIAL', 'NO_CUMPLE']),
      responsableRol: z.string().max(60).optional(),
    }),
  },
  async (d) => {
    const data = {
      norma: d.norma, emisor: v(d.emisor), tema: d.tema, articulos: v(d.articulos),
      comoCumple: v(d.comoCumple), cumplimiento: d.cumplimiento, responsableRol: v(d.responsableRol),
    }
    const n = d.id
      ? await dbAuditado.normaMatrizLegal.update({ where: { id: d.id }, data })
      : await dbAuditado.normaMatrizLegal.create({ data })
    revalidatePath('/sst')
    return { id: n.id }
  },
)

export const vincularEvidenciaNorma = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ normaId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.normaMatrizLegal.update({ where: { id: d.normaId }, data: { evidenciaDocId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const eliminarNormaMatrizLegal = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    await dbAuditado.normaMatrizLegal.update({ where: { id: d.id }, data: { activo: false } })
    revalidatePath('/sst')
  },
)

// ── Plan de mejoramiento de la autoevaluación (Res. 0312 art. 28) ──────────

/** Vincula el PDF del plan de mejora firmado a la autoevaluación. */
export const vincularDocumentoAutoeval = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ autoevaluacionId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.autoevaluacionSst.update({ where: { id: d.autoevaluacionId }, data: { documentoId: d.documentoId } })
    revalidatePath('/sst')
  },
)

/** Crea una acción del plan de mejora con alerta de vencimiento en la fecha límite. */
export const crearAccionMejora = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      autoevaluacionId: z.uuid(), actividad: z.string().min(3).max(500), responsable: z.string().min(2).max(120),
      fechaLimite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recursos: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    const a = await dbAuditado.accionMejoraSst.create({
      data: { autoevaluacionId: d.autoevaluacionId, actividad: d.actividad, responsable: d.responsable, fechaLimite: parseFechaISO(d.fechaLimite)!, recursos: v(d.recursos) },
    })
    await publicarVencimiento({
      origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccionMejoraSst', entidadId: a.id,
      titulo: `Acción de mejora SG-SST por vencer — ${d.actividad.slice(0, 80)}`,
      fechaVencimientoISO: d.fechaLimite, responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
    return { id: a.id }
  },
)

/** Marca una acción de mejora como cumplida (o la reabre) y cancela/reprograma su alerta. */
export const marcarAccionMejora = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), cumplida: z.boolean() }) },
  async (d) => {
    const a = await dbAuditado.accionMejoraSst.update({
      where: { id: d.id },
      data: { cumplida: d.cumplida, cumplidaEn: d.cumplida ? new Date() : null },
    })
    if (d.cumplida) {
      await cancelarVencimiento('AccionMejoraSst', d.id, 'ACCION_CORRECTIVA')
    } else {
      await publicarVencimiento({
        origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccionMejoraSst', entidadId: a.id,
        titulo: `Acción de mejora SG-SST por vencer — ${a.actividad.slice(0, 80)}`,
        fechaVencimientoISO: a.fechaLimite.toISOString().slice(0, 10), responsables: [{ rol: 'Responsable SST' }],
      })
    }
    revalidatePath('/sst')
  },
)

export const vincularEvidenciaAccionMejora = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ accionId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.accionMejoraSst.update({ where: { id: d.accionId }, data: { evidenciaDocId: d.documentoId } })
    revalidatePath('/sst')
  },
)

export const eliminarAccionMejora = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    await cancelarVencimiento('AccionMejoraSst', d.id, 'ACCION_CORRECTIVA')
    await dbAuditado.accionMejoraSst.delete({ where: { id: d.id } })
    revalidatePath('/sst')
  },
)

// ── Salud ocupacional: novedades ARL y seguimiento a recomendaciones ────────

/** Registra una novedad ante la ARL (afiliación, retiro, traslado, cambio de clase de riesgo). */
export const registrarNovedadArl = accion(
  {
    modulo: 'sst',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['AFILIACION', 'RETIRO', 'TRASLADO_ARL', 'CAMBIO_CLASE_RIESGO', 'OTRA']),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      detalle: z.string().max(500).optional(),
      claseRiesgo: z.enum(['I', 'II', 'III', 'IV', 'V']).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const n = await dbAuditado.novedadArl.create({
      data: { colaboradorId: d.colaboradorId, tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, detalle: v(d.detalle), claseRiesgo: d.claseRiesgo || null },
    })
    // Un cambio de clase de riesgo actualiza también la ficha del colaborador.
    if (d.tipo === 'CAMBIO_CLASE_RIESGO' && d.claseRiesgo) {
      await dbAuditado.colaborador.update({ where: { id: d.colaboradorId }, data: { claseRiesgoArl: d.claseRiesgo } })
    }
    revalidatePath('/sst')
    return { id: n.id }
  },
)

export const vincularSoporteNovedadArl = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ novedadId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.novedadArl.update({ where: { id: d.novedadId }, data: { soporteDocId: d.documentoId } })
    revalidatePath('/sst')
  },
)

/** Agrega una nota de seguimiento a las recomendaciones/restricciones de un examen (dato de salud). */
export const crearSeguimientoExamen = accion(
  {
    modulo: 'colaboradores_salud',
    accion: 'EDITAR',
    schema: z.object({ examenId: z.uuid(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), nota: z.string().min(3).max(1000) }),
  },
  async (d) => {
    await dbAuditado.seguimientoExamen.create({ data: { examenId: d.examenId, fecha: parseFechaISO(d.fecha)!, nota: d.nota } })
    // Registrar seguimiento reabre el caso si estaba cerrado.
    await dbAuditado.examenMedico.update({ where: { id: d.examenId }, data: { seguimientoCerrado: false } })
    revalidatePath('/sst')
  },
)

/** Cierra (o reabre) el seguimiento de recomendaciones de un examen. */
export const cerrarSeguimientoExamen = accion(
  { modulo: 'colaboradores_salud', accion: 'EDITAR', schema: z.object({ examenId: z.uuid(), cerrado: z.boolean() }) },
  async (d) => {
    await dbAuditado.examenMedico.update({ where: { id: d.examenId }, data: { seguimientoCerrado: d.cerrado } })
    revalidatePath('/sst')
  },
)

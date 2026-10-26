'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'
import { generarRecibidoEpp } from '@/server/epp'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { eliminarDocumento } from '@/server/documentos'
import { exigirColaboradorEnAlcance } from '@/server/consultas/colaboradores'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)
const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** Anular/eliminar siempre pide el porqué: queda en la auditoría junto al borrado. */
const motivoSchema = z.string().trim().min(5, 'Explica por qué se anula.').max(300)

/**
 * Borra los documentos que cuelgan de un registro: los guardados con su
 * `entidadTipo`/`entidadId` y los que el registro apunta por id directo
 * (soporte, acta, evidencia). Se llama DESPUÉS de borrar el registro.
 */
async function borrarDocumentosDe(entidadTipo: string, entidadId: string, ...directos: (string | null | undefined)[]) {
  const docs = await prisma.documento.findMany({ where: { entidadTipo, entidadId }, select: { id: true } })
  const ids = new Set([...docs.map((d) => d.id), ...directos.filter((x): x is string => Boolean(x))])
  for (const id of ids) await eliminarDocumento(id).catch(() => {})
}

/**
 * Los indicadores mensuales guardan accidentes/días perdidos calculados al
 * registrarlos. Al corregir o anular un accidente, el mes afectado se vuelve a
 * calcular para que el semáforo no quede con la cifra vieja.
 */
async function sincronizarIndicadorDelMes(fecha: Date) {
  const anio = fecha.getUTCFullYear(), mes = fecha.getUTCMonth() + 1
  const existe = await prisma.indicadorSst.findUnique({ where: { anio_mes: { anio, mes } }, select: { id: true } })
  if (!existe) return
  const desde = new Date(Date.UTC(anio, mes - 1, 1)), hasta = new Date(Date.UTC(anio, mes, 1))
  const acc = await prisma.accidenteTrabajo.findMany({ where: { fecha: { gte: desde, lt: hasta }, esIncidente: false }, select: { diasIncapacidad: true } })
  await dbAuditado.indicadorSst.update({
    where: { id: existe.id },
    data: { numAccidentes: acc.length, diasPerdidos: acc.reduce((s, a) => s + (a.diasIncapacidad ?? 0), 0) },
  })
}

/**
 * Deja la clase de riesgo del colaborador como diga su cambio de clase más
 * reciente que siga registrado. Devuelve la clase aplicada, o null si ya no
 * queda ninguna novedad que la respalde: en ese caso la ficha NO se toca
 * (no se guarda cuál era la clase antes del cambio) y el cliente avisa que
 * hay que revisarla.
 */
async function recalcularClaseRiesgo(colaboradorId: string): Promise<string | null> {
  const ultima = await prisma.novedadArl.findFirst({
    where: { colaboradorId, tipo: 'CAMBIO_CLASE_RIESGO', claseRiesgo: { not: null } },
    orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
    select: { claseRiesgo: true },
  })
  if (!ultima?.claseRiesgo) return null
  await dbAuditado.colaborador.update({ where: { id: colaboradorId }, data: { claseRiesgoArl: ultima.claseRiesgo } })
  return ultima.claseRiesgo
}

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

export const editarMiembroComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), colaboradorId: z.uuid(), rol: z.string().min(2).max(60), porEmpleador: z.boolean() }) },
  async (d) => {
    await dbAuditado.miembroComite.update({ where: { id: d.id }, data: { colaboradorId: d.colaboradorId, rol: d.rol, porEmpleador: d.porEmpleador } })
    revalidatePath('/sst')
  },
)

/** Quita a un miembro del comité, con el motivo (queda en auditoría). */
export const eliminarMiembroComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.miembroComite.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'MiembroComite', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
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
        mensaje: 'La constancia está lista en tu autoservicio.',
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

export const editarBrigadista = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), sedeId: z.union([z.uuid(), z.literal('')]).optional(), rol: z.string().min(2).max(60) }) },
  async (d) => {
    await dbAuditado.brigadista.update({ where: { id: d.id }, data: { sedeId: v(d.sedeId), rol: d.rol } })
    revalidatePath('/sst')
  },
)

/** Retira a un brigadista (baja lógica: queda en el histórico) con el motivo. */
export const eliminarBrigadista = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.brigadista.update({ where: { id: d.id }, data: { activo: false } })
    await auditar('ELIMINAR', 'Brigadista', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
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

/** Retira una norma de la matriz (baja lógica) con el motivo. */
export const eliminarNormaMatrizLegal = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.normaMatrizLegal.update({ where: { id: d.id }, data: { activo: false } })
    await auditar('ELIMINAR', 'NormaMatrizLegal', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
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

export const editarAccionMejora = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(), actividad: z.string().min(3).max(500), responsable: z.string().min(2).max(120),
      fechaLimite: fechaISO, recursos: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    const a = await dbAuditado.accionMejoraSst.update({
      where: { id: d.id },
      data: { actividad: d.actividad, responsable: d.responsable, fechaLimite: parseFechaISO(d.fechaLimite)!, recursos: v(d.recursos) },
    })
    // La alerta sigue a la fecha límite nueva (solo mientras esté pendiente).
    await cancelarVencimiento('AccionMejoraSst', d.id, 'ACCION_CORRECTIVA')
    if (!a.cumplida) {
      await publicarVencimiento({
        origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccionMejoraSst', entidadId: a.id,
        titulo: `Acción de mejora SG-SST por vencer — ${d.actividad.slice(0, 80)}`,
        fechaVencimientoISO: d.fechaLimite, responsables: [{ rol: 'Responsable SST' }],
      })
    }
    revalidatePath('/sst')
  },
)

/** Elimina una acción del plan de mejora (con su evidencia y su alerta), con el motivo. */
export const eliminarAccionMejora = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const a = await prisma.accionMejoraSst.findUniqueOrThrow({ where: { id: d.id }, select: { evidenciaDocId: true } })
    await cancelarVencimiento('AccionMejoraSst', d.id, 'ACCION_CORRECTIVA')
    await dbAuditado.accionMejoraSst.delete({ where: { id: d.id } })
    await borrarDocumentosDe('AccionMejoraSst', d.id, a.evidenciaDocId)
    await auditar('ELIMINAR', 'AccionMejoraSst', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
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

// ── Editar y anular (corregir lo registrado por error sin ir a la base de datos) ──

export const editarComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), tipo: z.enum(['VIGIA_SST', 'COPASST', 'CONVIVENCIA']), fechaConformacion: fechaISO }) },
  async (d) => {
    const inicio = parseFechaISO(d.fechaConformacion)!
    const vence = new Date(inicio); vence.setUTCFullYear(vence.getUTCFullYear() + 2)
    await dbAuditado.comite.update({ where: { id: d.id }, data: { tipo: d.tipo, fechaConformacion: inicio, vigenciaHasta: vence } })
    await cancelarVencimiento('Comite', d.id, 'COMITE')
    await publicarVencimiento({
      origen: 'COMITE', entidadTipo: 'Comite', entidadId: d.id,
      titulo: `Renovación ${d.tipo === 'CONVIVENCIA' ? 'Comité de Convivencia' : d.tipo}`,
      fechaVencimientoISO: vence.toISOString().slice(0, 10), responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
  },
)

/** Elimina un comité con sus miembros, reuniones y actas, con el motivo. */
export const eliminarComite = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const reuniones = await prisma.reunionComite.findMany({ where: { comiteId: d.id }, select: { id: true, actaDocId: true } })
    await cancelarVencimiento('Comite', d.id, 'COMITE')
    await dbAuditado.comite.delete({ where: { id: d.id } }) // miembros y reuniones caen en cascada
    for (const r of reuniones) await borrarDocumentosDe('ReunionComite', r.id, r.actaDocId)
    await auditar('ELIMINAR', 'Comite', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const editarReunionComite = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), fecha: fechaISO, temas: z.string().min(3).max(1000), compromisos: z.string().max(1000).optional() }) },
  async (d) => {
    await dbAuditado.reunionComite.update({ where: { id: d.id }, data: { fecha: parseFechaISO(d.fecha)!, temas: d.temas, compromisos: v(d.compromisos) } })
    revalidatePath('/sst')
  },
)

export const eliminarReunionComite = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const r = await prisma.reunionComite.findUniqueOrThrow({ where: { id: d.id }, select: { actaDocId: true } })
    await dbAuditado.reunionComite.delete({ where: { id: d.id } })
    await borrarDocumentosDe('ReunionComite', d.id, r.actaDocId)
    await auditar('ELIMINAR', 'ReunionComite', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

/**
 * Corrige un examen médico. No se cambia la persona. Recomendaciones y
 * restricciones son dato de salud: si no vienen en la petición (el usuario no
 * tiene permiso de salud y el formulario no las muestra) se dejan como están.
 */
export const editarExamenMedico = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      tipo: z.enum(['INGRESO', 'PERIODICO', 'EGRESO', 'POST_INCAPACIDAD']),
      fecha: fechaISO,
      fechaVencimiento: fechaISO.optional().or(z.literal('')),
      concepto: z.enum(['APTO', 'APTO_CON_RECOMENDACIONES', 'NO_APTO', 'APLAZADO']),
      recomendaciones: z.string().max(1000).optional(),
      restricciones: z.string().max(1000).optional(),
    }),
  },
  async (d, usuario) => {
    const actual = await prisma.examenMedico.findUniqueOrThrow({ where: { id: d.id }, include: { colaborador: { select: { sedeId: true, nombres: true, apellidos: true } } } })
    await exigirColaboradorEnAlcance(usuario, actual.colaboradorId, 'sst', 'EDITAR')
    await dbAuditado.examenMedico.update({
      where: { id: d.id },
      data: {
        tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, fechaVencimiento: parseFechaISO(d.fechaVencimiento || null), concepto: d.concepto,
        ...(d.recomendaciones !== undefined ? { recomendaciones: v(d.recomendaciones) } : {}),
        ...(d.restricciones !== undefined ? { restricciones: v(d.restricciones) } : {}),
      },
    })
    await cancelarVencimiento('ExamenMedico', d.id, 'EXAMEN_MEDICO')
    if (d.fechaVencimiento) {
      await publicarVencimiento({
        origen: 'EXAMEN_MEDICO', entidadTipo: 'ExamenMedico', entidadId: d.id,
        titulo: `Examen médico por vencer — ${actual.colaborador.nombres} ${actual.colaborador.apellidos}`,
        fechaVencimientoISO: d.fechaVencimiento, sedeId: actual.colaborador.sedeId, responsables: [{ rol: 'Responsable SST' }],
      })
    }
    revalidatePath('/sst')
  },
)

/** Elimina un examen con su certificado, sus seguimientos y su alerta, con el motivo. */
export const eliminarExamenMedico = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d, usuario) => {
    const e = await prisma.examenMedico.findUniqueOrThrow({ where: { id: d.id }, select: { colaboradorId: true, documentoId: true } })
    await exigirColaboradorEnAlcance(usuario, e.colaboradorId, 'sst', 'ELIMINAR')
    await cancelarVencimiento('ExamenMedico', d.id, 'EXAMEN_MEDICO')
    await dbAuditado.examenMedico.delete({ where: { id: d.id } }) // seguimientos en cascada
    await borrarDocumentosDe('ExamenMedico', d.id, e.documentoId)
    await auditar('ELIMINAR', 'ExamenMedico', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const editarSeguimientoExamen = accion(
  { modulo: 'colaboradores_salud', accion: 'EDITAR', schema: z.object({ id: z.uuid(), fecha: fechaISO, nota: z.string().min(3).max(1000) }) },
  async (d) => {
    await dbAuditado.seguimientoExamen.update({ where: { id: d.id }, data: { fecha: parseFechaISO(d.fecha)!, nota: d.nota } })
    revalidatePath('/sst')
  },
)

export const eliminarSeguimientoExamen = accion(
  { modulo: 'colaboradores_salud', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.seguimientoExamen.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'SeguimientoExamen', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

/**
 * Corrige los datos del reporte de un accidente/incidente (persona, fecha,
 * descripción…). El seguimiento (estado, investigación, FURAT) sigue en
 * `actualizarAccidente`. La alerta FURAT se reprograma según la fecha nueva y
 * se quita si pasa a ser incidente.
 */
export const editarAccidente = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(), colaboradorId: z.uuid(), fecha: fechaISO, descripcion: z.string().min(5).max(1000),
      parteCuerpo: z.string().max(120).optional(), diasIncapacidad: z.coerce.number().int().min(0).optional(), esIncidente: z.boolean().optional(),
    }),
  },
  async (d, usuario) => {
    const actual = await prisma.accidenteTrabajo.findUniqueOrThrow({ where: { id: d.id } })
    await exigirColaboradorEnAlcance(usuario, actual.colaboradorId, 'sst', 'EDITAR')
    if (d.colaboradorId !== actual.colaboradorId) await exigirColaboradorEnAlcance(usuario, d.colaboradorId, 'sst', 'EDITAR')
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { sedeId: true, nombres: true, apellidos: true } })
    const esIncidente = d.esIncidente ?? false
    const fecha = parseFechaISO(d.fecha)!
    // Un incidente no se reporta a la ARL; si deja de serlo, el FURAT vuelve a quedar pendiente.
    const furatReportado = esIncidente ? true : actual.esIncidente ? false : actual.furatReportado
    await dbAuditado.accidenteTrabajo.update({
      where: { id: d.id },
      data: {
        colaboradorId: d.colaboradorId, fecha, sedeId: colab.sedeId, descripcion: d.descripcion,
        parteCuerpo: esIncidente ? null : v(d.parteCuerpo), diasIncapacidad: esIncidente ? null : (d.diasIncapacidad ?? null),
        esIncidente, furatReportado,
      },
    })
    await cancelarVencimiento('AccidenteTrabajo', d.id, 'ACCION_CORRECTIVA')
    if (!esIncidente && !furatReportado) {
      const limite = new Date(fecha); limite.setUTCDate(limite.getUTCDate() + 2)
      await publicarVencimiento({
        origen: 'ACCION_CORRECTIVA', entidadTipo: 'AccidenteTrabajo', entidadId: d.id,
        titulo: `Reporte FURAT pendiente — ${colab.nombres} ${colab.apellidos}`,
        fechaVencimientoISO: limite.toISOString().slice(0, 10), sedeId: colab.sedeId, responsables: [{ rol: 'Responsable SST' }],
      })
    }
    await sincronizarIndicadorDelMes(actual.fecha)
    if (formatFechaISO(actual.fecha) !== d.fecha) await sincronizarIndicadorDelMes(fecha)
    revalidatePath('/sst')
  },
)

/** Elimina un accidente/incidente con sus soportes y su alerta FURAT, con el motivo. */
export const eliminarAccidente = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d, usuario) => {
    const a = await prisma.accidenteTrabajo.findUniqueOrThrow({ where: { id: d.id }, select: { colaboradorId: true, fecha: true } })
    await exigirColaboradorEnAlcance(usuario, a.colaboradorId, 'sst', 'ELIMINAR')
    await cancelarVencimiento('AccidenteTrabajo', d.id, 'ACCION_CORRECTIVA')
    await dbAuditado.accidenteTrabajo.delete({ where: { id: d.id } })
    await borrarDocumentosDe('AccidenteTrabajo', d.id)
    await sincronizarIndicadorDelMes(a.fecha)
    await auditar('ELIMINAR', 'AccidenteTrabajo', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

/**
 * Corrige una novedad de ARL (no se cambia la persona). Si la novedad era o
 * pasa a ser un cambio de clase de riesgo, la ficha del colaborador queda con
 * la clase del cambio más reciente que siga registrado; `claseRiesgo` dice
 * cuál quedó (null = no había otra novedad que la respalde y no se tocó).
 */
export const editarNovedadArl = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      tipo: z.enum(['AFILIACION', 'RETIRO', 'TRASLADO_ARL', 'CAMBIO_CLASE_RIESGO', 'OTRA']),
      fecha: fechaISO, detalle: z.string().max(500).optional(),
      claseRiesgo: z.enum(['I', 'II', 'III', 'IV', 'V']).optional().or(z.literal('')),
    }),
  },
  async (d, usuario) => {
    const actual = await prisma.novedadArl.findUniqueOrThrow({ where: { id: d.id } })
    await exigirColaboradorEnAlcance(usuario, actual.colaboradorId, 'sst', 'EDITAR')
    await dbAuditado.novedadArl.update({
      where: { id: d.id },
      data: { tipo: d.tipo, fecha: parseFechaISO(d.fecha)!, detalle: v(d.detalle), claseRiesgo: d.claseRiesgo || null },
    })
    const tocaClase = actual.tipo === 'CAMBIO_CLASE_RIESGO' || d.tipo === 'CAMBIO_CLASE_RIESGO'
    const claseRiesgo = tocaClase ? await recalcularClaseRiesgo(actual.colaboradorId) : undefined
    revalidatePath('/sst')
    return { tocaClase, claseRiesgo: claseRiesgo ?? null }
  },
)

/** Elimina una novedad de ARL con su soporte, con el motivo; la clase de riesgo se recalcula igual que al editar. */
export const eliminarNovedadArl = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d, usuario) => {
    const n = await prisma.novedadArl.findUniqueOrThrow({ where: { id: d.id } })
    await exigirColaboradorEnAlcance(usuario, n.colaboradorId, 'sst', 'ELIMINAR')
    await dbAuditado.novedadArl.delete({ where: { id: d.id } })
    await borrarDocumentosDe('NovedadArl', d.id, n.soporteDocId)
    const tocaClase = n.tipo === 'CAMBIO_CLASE_RIESGO'
    const claseRiesgo = tocaClase ? await recalcularClaseRiesgo(n.colaboradorId) : undefined
    await auditar('ELIMINAR', 'NovedadArl', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true, tocaClase, claseRiesgo: claseRiesgo ?? null }
  },
)

export const editarEpp = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), nombre: z.string().min(2).max(120), vidaUtilMeses: z.coerce.number().int().min(0).optional() }) },
  async (d) => {
    const repetido = await prisma.elementoEpp.findFirst({ where: { nombre: d.nombre, id: { not: d.id } }, select: { id: true } })
    if (repetido) throw new ErrorNegocio('Ya existe otro EPP con ese nombre. Usa un nombre distinto.')
    await dbAuditado.elementoEpp.update({ where: { id: d.id }, data: { nombre: d.nombre, vidaUtilMeses: d.vidaUtilMeses ?? null } })
    revalidatePath('/sst')
  },
)

/** Elimina un elemento del catálogo de EPP, solo si nunca se ha entregado. */
export const eliminarEpp = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const entregas = await prisma.entregaEpp.count({ where: { elementoEppId: d.id } })
    if (entregas > 0) throw new ErrorNegocio(`Este EPP tiene ${entregas} entrega${entregas === 1 ? '' : 's'} registrada${entregas === 1 ? '' : 's'}: no se puede eliminar. Anula primero esas entregas si fueron un error.`)
    await dbAuditado.elementoEpp.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'ElementoEpp', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

const BLOQUEO_EPP_FIRMADO = 'El trabajador ya firmó el recibido de esta entrega: no se puede cambiar ni anular. Si hubo un error, registra una entrega nueva o una reposición.'

/**
 * Corrige una entrega de EPP que el trabajador aún no ha firmado. La
 * constancia en PDF dice qué se entregó y a quién, así que se rehace y la
 * anterior se descarta; si cambió la persona, se le avisa a la nueva.
 */
export const editarEntregaEpp = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), elementoEppId: z.uuid(), colaboradorId: z.uuid(), cantidad: z.coerce.number().int().min(1), fechaEntrega: fechaISO, reposicion: z.boolean() }) },
  async (d, usuario) => {
    const e = await prisma.entregaEpp.findUniqueOrThrow({ where: { id: d.id } })
    if (e.firmadoEn) throw new ErrorNegocio(BLOQUEO_EPP_FIRMADO)
    await exigirColaboradorEnAlcance(usuario, e.colaboradorId, 'sst', 'EDITAR')
    if (d.colaboradorId !== e.colaboradorId) await exigirColaboradorEnAlcance(usuario, d.colaboradorId, 'sst', 'EDITAR')
    await dbAuditado.entregaEpp.update({
      where: { id: d.id },
      data: { elementoEppId: d.elementoEppId, colaboradorId: d.colaboradorId, cantidad: d.cantidad, fechaEntrega: parseFechaISO(d.fechaEntrega)!, reposicion: d.reposicion },
    })
    const anterior = e.soporteDocId
    await generarRecibidoEpp(d.id, usuario.id)
    if (anterior) await eliminarDocumento(anterior).catch(() => {})
    if (d.colaboradorId !== e.colaboradorId) {
      const uid = await usuarioDeColaborador(d.colaboradorId)
      if (uid) {
        await avisar(uid, {
          titulo: 'Firma el recibido de tus EPP', mensaje: 'La constancia está lista en tu autoservicio.',
          enlace: '/autoservicio/dotacion', llamadoAccion: 'Firmar el recibido', evento: 'epp_entregado',
        }).catch(() => {})
      }
    }
    revalidatePath('/sst')
    revalidatePath('/autoservicio/dotacion')
  },
)

/** Anula una entrega de EPP sin firmar: borra la constancia y le avisa al trabajador. */
export const eliminarEntregaEpp = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d, usuario) => {
    const e = await prisma.entregaEpp.findUniqueOrThrow({ where: { id: d.id }, include: { elementoEpp: { select: { nombre: true } } } })
    if (e.firmadoEn) throw new ErrorNegocio(BLOQUEO_EPP_FIRMADO)
    await exigirColaboradorEnAlcance(usuario, e.colaboradorId, 'sst', 'ELIMINAR')
    await dbAuditado.entregaEpp.delete({ where: { id: d.id } })
    await borrarDocumentosDe('EntregaEpp', d.id, e.soporteDocId)
    const uid = await usuarioDeColaborador(e.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'epp_entregado', titulo: `Se anuló la entrega de EPP (${e.elementoEpp.nombre})`,
        mensaje: `Ya no tienes que firmar ese recibido. Motivo: ${d.motivo}`, enlace: '/autoservicio/dotacion',
      }).catch(() => {})
    }
    await auditar('ELIMINAR', 'EntregaEpp', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    revalidatePath('/autoservicio/dotacion')
    return { ok: true }
  },
)

export const editarPeligro = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      proceso: z.string().min(2).max(120), peligro: z.string().min(2).max(200), riesgo: z.string().min(2).max(200),
      nivel: z.enum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']), controles: z.string().max(500).optional(),
      sedeId: z.union([z.uuid(), z.literal('')]).optional(), rutinaria: z.boolean(),
      controlFuente: z.string().max(300).optional(), controlMedio: z.string().max(300).optional(), controlIndividuo: z.string().max(300).optional(),
      responsable: z.string().max(120).optional(), fechaRevision: fechaISO.optional().or(z.literal('')),
    }),
  },
  async (d) => {
    await dbAuditado.peligroIpevr.update({
      where: { id: d.id },
      data: {
        proceso: d.proceso, peligro: d.peligro, riesgo: d.riesgo, nivel: d.nivel, controles: v(d.controles), sedeId: v(d.sedeId),
        rutinaria: d.rutinaria, controlFuente: v(d.controlFuente), controlMedio: v(d.controlMedio), controlIndividuo: v(d.controlIndividuo),
        responsable: v(d.responsable), fechaRevision: parseFechaISO(d.fechaRevision || null),
      },
    })
    revalidatePath('/sst')
  },
)

export const eliminarPeligro = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.peligroIpevr.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'PeligroIpevr', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const eliminarProfesiograma = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    await dbAuditado.profesiograma.delete({ where: { id: d.id } })
    await auditar('ELIMINAR', 'Profesiograma', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const editarPlanEmergencia = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(), sedeId: z.union([z.uuid(), z.literal('')]).optional(), version: z.string().min(1).max(40),
      vigenciaDesde: fechaISO, vigenciaHasta: fechaISO,
    }),
  },
  async (d) => {
    await dbAuditado.planEmergencia.update({
      where: { id: d.id },
      data: { sedeId: v(d.sedeId), version: d.version, vigenciaDesde: parseFechaISO(d.vigenciaDesde)!, vigenciaHasta: parseFechaISO(d.vigenciaHasta)! },
    })
    await cancelarVencimiento('PlanEmergencia', d.id, 'PLAN_EMERGENCIA')
    await publicarVencimiento({
      origen: 'PLAN_EMERGENCIA', entidadTipo: 'PlanEmergencia', entidadId: d.id,
      titulo: `Actualización del plan de emergencias (v${d.version})`,
      fechaVencimientoISO: d.vigenciaHasta, sedeId: v(d.sedeId), responsables: [{ rol: 'Responsable SST' }],
    })
    revalidatePath('/sst')
  },
)

export const eliminarPlanEmergencia = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const p = await prisma.planEmergencia.findUniqueOrThrow({ where: { id: d.id }, select: { documentoId: true } })
    await cancelarVencimiento('PlanEmergencia', d.id, 'PLAN_EMERGENCIA')
    await dbAuditado.planEmergencia.delete({ where: { id: d.id } })
    await borrarDocumentosDe('PlanEmergencia', d.id, p.documentoId)
    await auditar('ELIMINAR', 'PlanEmergencia', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const editarSimulacro = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(), sedeId: z.union([z.uuid(), z.literal('')]).optional(), fecha: fechaISO, tipo: z.string().min(2).max(80),
      participantes: z.coerce.number().int().min(0).optional(), observaciones: z.string().max(1000).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.simulacro.update({
      where: { id: d.id },
      data: { sedeId: v(d.sedeId), fecha: parseFechaISO(d.fecha)!, tipo: d.tipo, participantes: d.participantes ?? null, observaciones: v(d.observaciones) },
    })
    revalidatePath('/sst')
  },
)

export const eliminarSimulacro = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const s = await prisma.simulacro.findUniqueOrThrow({ where: { id: d.id }, select: { documentoId: true } })
    await dbAuditado.simulacro.delete({ where: { id: d.id } })
    await borrarDocumentosDe('Simulacro', d.id, s.documentoId)
    await auditar('ELIMINAR', 'Simulacro', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const editarInspeccion = accion(
  {
    modulo: 'sst',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(), sedeId: z.union([z.uuid(), z.literal('')]).optional(), fecha: fechaISO, tipo: z.string().min(2).max(80),
      area: z.string().max(120).optional(), hallazgos: z.string().min(2).max(2000), responsable: z.string().max(120).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.inspeccionSst.update({
      where: { id: d.id },
      data: { sedeId: v(d.sedeId), fecha: parseFechaISO(d.fecha)!, tipo: d.tipo, area: v(d.area), hallazgos: d.hallazgos, responsable: v(d.responsable) },
    })
    revalidatePath('/sst')
  },
)

export const eliminarInspeccion = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const i = await prisma.inspeccionSst.findUniqueOrThrow({ where: { id: d.id }, select: { documentoId: true } })
    await dbAuditado.inspeccionSst.delete({ where: { id: d.id } })
    await borrarDocumentosDe('InspeccionSst', d.id, i.documentoId)
    await auditar('ELIMINAR', 'InspeccionSst', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

/** Corrige la designación vigente del responsable del SG-SST (fecha, licencia, horas); la persona no cambia. */
export const editarResponsableSgsst = accion(
  { modulo: 'sst', accion: 'EDITAR', schema: z.object({ id: z.uuid(), fechaDesignacion: fechaISO, licenciaSst: z.string().max(60).optional(), cursoHoras: z.coerce.number().int().min(0).optional() }) },
  async (d) => {
    await dbAuditado.responsableSgsst.update({
      where: { id: d.id },
      data: { fechaDesignacion: parseFechaISO(d.fechaDesignacion)!, licenciaSst: v(d.licenciaSst), cursoHoras: d.cursoHoras ?? null },
    })
    revalidatePath('/sst')
  },
)

/**
 * Anula la designación vigente (hecha por error) con su carta. La designación
 * anterior más reciente, si existe, vuelve a quedar vigente.
 */
export const eliminarResponsableSgsst = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const r = await prisma.responsableSgsst.findUniqueOrThrow({ where: { id: d.id }, select: { cartaDocId: true, activo: true } })
    await dbAuditado.responsableSgsst.delete({ where: { id: d.id } })
    await borrarDocumentosDe('ResponsableSgsst', d.id, r.cartaDocId)
    if (r.activo) {
      const anterior = await prisma.responsableSgsst.findFirst({ where: { activo: false }, orderBy: { creadoEn: 'desc' }, select: { id: true } })
      if (anterior) await dbAuditado.responsableSgsst.update({ where: { id: anterior.id }, data: { activo: true } })
    }
    await auditar('ELIMINAR', 'ResponsableSgsst', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const eliminarPlanTrabajoSst = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const p = await prisma.planTrabajoSst.findUniqueOrThrow({ where: { id: d.id }, select: { documentoId: true } })
    await dbAuditado.planTrabajoSst.delete({ where: { id: d.id } })
    await borrarDocumentosDe('PlanTrabajoSst', d.id, p.documentoId)
    await auditar('ELIMINAR', 'PlanTrabajoSst', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

/** Elimina una autoevaluación con su plan de mejora (acciones, evidencias y alertas), con el motivo. */
export const eliminarAutoevaluacion = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const a = await prisma.autoevaluacionSst.findUniqueOrThrow({ where: { id: d.id }, include: { acciones: { select: { id: true, evidenciaDocId: true } } } })
    for (const ac of a.acciones) await cancelarVencimiento('AccionMejoraSst', ac.id, 'ACCION_CORRECTIVA')
    await dbAuditado.autoevaluacionSst.delete({ where: { id: d.id } }) // acciones en cascada
    for (const ac of a.acciones) await borrarDocumentosDe('AccionMejoraSst', ac.id, ac.evidenciaDocId)
    await borrarDocumentosDe('AutoevaluacionSst', d.id, a.documentoId)
    await auditar('ELIMINAR', 'AutoevaluacionSst', { registroId: d.id, descripcion: `Anulado: ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

export const eliminarIndicadorSst = accion(
  { modulo: 'sst', accion: 'ELIMINAR', schema: z.object({ anio: z.coerce.number().int().min(2000), mes: z.coerce.number().int().min(1).max(12), motivo: motivoSchema }) },
  async (d) => {
    const i = await prisma.indicadorSst.findUniqueOrThrow({ where: { anio_mes: { anio: d.anio, mes: d.mes } }, select: { id: true } })
    await dbAuditado.indicadorSst.delete({ where: { id: i.id } })
    await auditar('ELIMINAR', 'IndicadorSst', { registroId: i.id, descripcion: `Anulado (${d.anio}-${String(d.mes).padStart(2, '0')}): ${d.motivo}` })
    revalidatePath('/sst')
    return { ok: true }
  },
)

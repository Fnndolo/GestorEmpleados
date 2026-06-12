'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { contratoSchema, prorrogaSchema, otrosiSchema, suspensionSchema } from '@/lib/validaciones/contrato'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento, resolverVencimiento } from '@/server/vencimientos/servicio'

async function siguienteNumero(prefijo: string): Promise<string> {
  const anio = new Date().getUTCFullYear()
  const modelo = prefijo === 'CT' ? prisma.contrato : prisma.contratoOps
  const total = await (modelo as typeof prisma.contrato).count()
  return `${prefijo}-${anio}-${String(total + 1).padStart(4, '0')}`
}

function nombreColab(c: { nombres: string; apellidos: string }) {
  return `${c.nombres} ${c.apellidos}`
}

async function publicarVencimientosContrato(contratoId: string) {
  const c = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { colaborador: true },
  })
  // Contrato a término fijo → alerta de vencimiento
  if (c.tipo === 'TERMINO_FIJO' && c.fechaFin && c.estado === 'ACTIVO') {
    await publicarVencimiento({
      origen: 'CONTRATO_FIJO',
      entidadTipo: 'Contrato',
      entidadId: c.id,
      titulo: `Vence contrato fijo ${c.numero} — ${nombreColab(c.colaborador)}`,
      fechaVencimientoISO: formatFechaISO(c.fechaFin),
      sedeId: c.sedeId,
    })
  } else {
    await resolverVencimiento('Contrato', c.id, 'CONTRATO_FIJO')
  }
  // Fin de periodo de prueba → alerta
  if (c.periodoPruebaFin && c.estado === 'ACTIVO' && c.periodoPruebaFin >= new Date()) {
    await publicarVencimiento({
      origen: 'PERIODO_PRUEBA',
      entidadTipo: 'Contrato',
      entidadId: c.id,
      titulo: `Fin de periodo de prueba ${c.numero} — ${nombreColab(c.colaborador)}`,
      fechaVencimientoISO: formatFechaISO(c.periodoPruebaFin),
      sedeId: c.sedeId,
    })
  }
}

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearContrato = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: contratoSchema },
  async (d) => {
    if (d.tipo === 'TERMINO_FIJO' && !d.fechaFin) throw new ErrorNegocio('Un contrato a término fijo requiere fecha de fin.')
    if (d.tipo === 'OBRA_LABOR' && !d.objetoObraLabor) throw new ErrorNegocio('Indica el objeto de la obra o labor.')

    // Validación CST: término fijo ≤ 4 años
    if (d.tipo === 'TERMINO_FIJO' && d.fechaFin) {
      const dur = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
      if (dur > 4) throw new ErrorNegocio('El contrato a término fijo no puede superar 4 años.')
    }

    let periodoPruebaFin: Date | null = null
    if (d.periodoPruebaDias && d.periodoPruebaDias > 0) {
      periodoPruebaFin = parseFechaISO(d.fechaInicio)!
      periodoPruebaFin.setUTCDate(periodoPruebaFin.getUTCDate() + d.periodoPruebaDias)
    }

    const numero = await siguienteNumero('CT')
    const contrato = await dbAuditado.contrato.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        tipo: d.tipo,
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        jornada: d.jornada,
        horasSemanales: d.horasSemanales ?? null,
        modalidadTrabajo: d.modalidadTrabajo,
        salarioBase: d.salarioBase,
        tipoSalario: d.tipoSalario,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        objetoObraLabor: v(d.objetoObraLabor),
        etapaAprendizaje: (v(d.etapaAprendizaje) as 'LECTIVA' | 'PRODUCTIVA' | null) ?? null,
        apoyoSostenimiento: null,
        periodoPruebaDias: d.periodoPruebaDias ?? null,
        periodoPruebaFin,
        estado: 'ACTIVO',
        observaciones: v(d.observaciones),
      },
    })
    await publicarVencimientosContrato(contrato.id)
    revalidatePath('/contratos')
    return { id: contrato.id }
  },
)

export const agregarProrroga = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: prorrogaSchema },
  async (d) => {
    const contrato = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: { prorrogas: true },
    })
    if (contrato.tipo !== 'TERMINO_FIJO') throw new ErrorNegocio('Solo los contratos a término fijo se prorrogan.')

    const numero = contrato.prorrogas.length + 1
    // CST: tras 3 prórrogas de fijo < 1 año, la renovación mínima es 1 año
    const durOriginal = contrato.fechaFin
      ? (contrato.fechaFin.getTime() - contrato.fechaInicio.getTime()) / (365 * 86_400_000)
      : 0
    const durNueva = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
    if (durOriginal < 1 && numero >= 4 && durNueva < 1) {
      throw new ErrorNegocio('Tras 3 prórrogas de un contrato fijo menor a 1 año, la renovación mínima es de 1 año (CST art. 46).')
    }

    await dbAuditado.prorrogaContrato.create({
      data: {
        contratoId: d.contratoId,
        numero,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        fechaFirma: parseFechaISO(d.fechaFirma),
      },
    })
    await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: { fechaFin: parseFechaISO(d.fechaFin)! } })
    await publicarVencimientosContrato(d.contratoId)
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const agregarOtrosi = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: otrosiSchema },
  async (d) => {
    const contrato = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: { otrosis: true },
    })
    const numero = contrato.otrosis.length + 1
    const antes: Record<string, number> = {}
    const despues: Record<string, number> = {}
    const updateContrato: Record<string, unknown> = {}
    const updateColab: Record<string, unknown> = {}

    if (d.tiposCambio.includes('SALARIO') && d.salarioNuevo != null) {
      antes.salario = Number(contrato.salarioBase)
      despues.salario = d.salarioNuevo
      updateContrato.salarioBase = d.salarioNuevo
      await prisma.variacionSalarial.create({
        data: {
          colaboradorId: contrato.colaboradorId,
          salarioAnterior: contrato.salarioBase,
          salarioNuevo: d.salarioNuevo,
          fechaVigencia: parseFechaISO(d.fecha)!,
          motivo: `Otrosí ${numero}`,
        },
      })
    }
    if (d.tiposCambio.includes('CARGO') && v(d.cargoNuevoId)) {
      updateContrato.cargoId = d.cargoNuevoId
      updateColab.cargoId = d.cargoNuevoId
    }
    if (d.tiposCambio.includes('SEDE') && v(d.sedeNuevaId)) {
      updateContrato.sedeId = d.sedeNuevaId
      updateColab.sedeId = d.sedeNuevaId
    }
    if (d.tiposCambio.includes('MODALIDAD_TRABAJO') && v(d.modalidadNueva)) {
      updateContrato.modalidadTrabajo = d.modalidadNueva
      updateColab.modalidadTrabajo = d.modalidadNueva
    }
    if (d.tiposCambio.includes('DURACION') && v(d.fechaFinNueva)) {
      updateContrato.fechaFin = parseFechaISO(d.fechaFinNueva)
    }

    await dbAuditado.otrosiContrato.create({
      data: {
        contratoId: d.contratoId,
        numero,
        fecha: parseFechaISO(d.fecha)!,
        tiposCambio: d.tiposCambio,
        descripcion: d.descripcion,
        valoresAnteriores: Object.keys(antes).length ? antes : undefined,
        valoresNuevos: Object.keys(despues).length ? despues : undefined,
      },
    })
    if (Object.keys(updateContrato).length) await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: updateContrato })
    if (Object.keys(updateColab).length) await dbAuditado.colaborador.update({ where: { id: contrato.colaboradorId }, data: updateColab })
    if (updateContrato.fechaFin) await publicarVencimientosContrato(d.contratoId)
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const registrarSuspension = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: suspensionSchema },
  async (d) => {
    await dbAuditado.suspensionContrato.create({
      data: {
        contratoId: d.contratoId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        causa: d.causa,
        descripcion: v(d.descripcion),
      },
    })
    await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: { estado: 'SUSPENDIDO' } })
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const reactivarContrato = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.contrato.update({ where: { id }, data: { estado: 'ACTIVO' } })
    revalidatePath(`/contratos/${id}`)
  },
)

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { cargarParametros } from '@/server/nomina/parametros'
import { liquidacionDefinitiva } from '@/server/nomina/liquidacion-definitiva'
import { saldoVacaciones } from '@/server/vacaciones'
import { restringirAccesoSiSinVinculo, devolverAccesoNormal } from '@/server/rol-consulta'

const ITEMS_PAZ_SALVO = [
  { area: 'Activos', concepto: 'Equipos y activos asignados devueltos' },
  { area: 'Cartera', concepto: 'Préstamos y cartera al día' },
  { area: 'Documentos', concepto: 'Documentos y expedientes entregados' },
  { area: 'Sistemas', concepto: 'Accesos y correos revocados' },
  { area: 'Dotación', concepto: 'Dotación devuelta (si aplica)' },
]

export const crearTerminacion = accion(
  {
    modulo: 'terminaciones',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['RENUNCIA_VOLUNTARIA', 'SIN_JUSTA_CAUSA', 'CON_JUSTA_CAUSA', 'TERMINACION_ANTICIPADA', 'MUTUO_ACUERDO', 'VENCIMIENTO_PLAZO', 'PERIODO_PRUEBA', 'FIN_OPS']),
      fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      preavisoDias: z.coerce.number().int().min(0).optional(),
      motivo: z.string().max(1000).optional(),
      procesoDisciplinarioId: z.uuid().optional(),
    }),
  },
  async (d) => {
    const existe = await prisma.terminacion.findFirst({ where: { colaboradorId: d.colaboradorId, estado: { not: 'CERRADA' } } })
    if (existe) throw new ErrorNegocio('Ya hay una terminación en proceso para este colaborador.')

    // Debido proceso: una terminación CON JUSTA CAUSA debe sustentarse en un
    // proceso disciplinario CERRADO del mismo colaborador (RIT arts. 71-73 y 85:
    // la terminación por justa causa es una sanción y exige el procedimiento).
    if (d.tipo === 'CON_JUSTA_CAUSA') {
      if (!d.procesoDisciplinarioId) {
        throw new ErrorNegocio('Una terminación con justa causa requiere el proceso disciplinario que la sustenta (RIT arts. 71-73). Selecciónalo, o adelanta primero el proceso.')
      }
      const proceso = await prisma.procesoDisciplinario.findUnique({ where: { id: d.procesoDisciplinarioId } })
      if (!proceso || proceso.colaboradorId !== d.colaboradorId) {
        throw new ErrorNegocio('El proceso disciplinario no corresponde a este colaborador.')
      }
      if (!proceso.cerrado) {
        throw new ErrorNegocio('El proceso disciplinario aún está abierto: debe cerrarse con decisión antes de terminar con justa causa (debido proceso, RIT art. 73).')
      }
    }

    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId } })
    const contrato = await prisma.contrato.findFirst({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' } })
    const fechaRetiro = parseFechaISO(d.fechaRetiro)!

    // Cálculo de la liquidación definitiva (borrador para revisión del área contable)
    let liquidacionData: Awaited<ReturnType<typeof calcularLiq>> | null = null
    if (contrato) liquidacionData = await calcularLiq(d.colaboradorId, contrato, fechaRetiro, d.tipo)

    const terminacion = await dbAuditado.terminacion.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo, fechaRetiro,
        preavisoDias: d.preavisoDias ?? null,
        procesoDisciplinarioId: d.tipo === 'CON_JUSTA_CAUSA' ? d.procesoDisciplinarioId : null,
        indemnizacion: liquidacionData?.indemnizacion ?? null,
        motivo: d.motivo, estado: liquidacionData ? 'LIQUIDADA' : 'EN_PROCESO',
      },
    })

    if (liquidacionData && contrato) {
      await prisma.liquidacionDefinitiva.create({
        data: {
          terminacionId: terminacion.id,
          diasLiquidados: liquidacionData.diasLiquidados,
          salarioBase: contrato.salarioBase,
          cesantias: liquidacionData.cesantias,
          interesesCesantias: liquidacionData.interesesCesantias,
          prima: liquidacionData.prima,
          vacaciones: liquidacionData.vacaciones,
          indemnizacion: liquidacionData.indemnizacion,
          deducciones: liquidacionData.deducciones,
          total: liquidacionData.total,
          detalle: liquidacionData as object,
        },
      })
    }

    // Paz y salvo con ítems automáticos
    const saldoPrestamo = await prisma.prestamo.aggregate({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } })
    const pazYSalvo = await prisma.pazYSalvo.create({ data: { terminacionId: terminacion.id, estado: 'PENDIENTE' } })
    await prisma.pazYSalvoItem.createMany({
      data: ITEMS_PAZ_SALVO.map((item) => ({
        pazYSalvoId: pazYSalvo.id,
        area: item.area,
        concepto: item.area === 'Cartera' && Number(saldoPrestamo._sum.saldo ?? 0) > 0
          ? `${item.concepto} (saldo préstamo pendiente)` : item.concepto,
        cumplido: false,
      })),
    })

    // Marcar colaborador como retirado y contrato terminado
    await dbAuditado.colaborador.update({ where: { id: d.colaboradorId }, data: { estado: 'RETIRADO', fechaRetiro } })
    if (contrato) await dbAuditado.contrato.update({ where: { id: contrato.id }, data: { estado: 'TERMINADO' } })

    // Acceso de solo consulta: sin vínculo vigente, el usuario ya no puede crear
    // solicitudes, firmar ni radicar nada — solo ver su historial (habeas data).
    const accesoRestringido = await restringirAccesoSiSinVinculo(d.colaboradorId)

    revalidatePath('/terminaciones')
    return { id: terminacion.id, accesoRestringido }
  },
)

async function calcularLiq(colaboradorId: string, contrato: { salarioBase: unknown; tipo: string; fechaFin: Date | null }, fechaRetiro: Date, tipo: string) {
  const parametros = await cargarParametros(fechaRetiro)
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } })
  const saldoVac = await saldoVacaciones(colaboradorId)
  const saldoPrestamo = await prisma.prestamo.aggregate({ where: { colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } })
  // Promedio de comisiones de los últimos periodos
  const comisiones = await prisma.comision.aggregate({ where: { colaboradorId }, _avg: { valor: true } })

  // Saldo negativo = tomó vacaciones anticipadas y se retira antes de causarlas.
  // Solo se descuenta si el colaborador lo autorizó por escrito al solicitarlas
  // (RIT art. 69 num. 4: ninguna deducción sin autorización previa y escrita).
  let diasVacaciones = Math.max(0, saldoVac.saldo)
  if (saldoVac.saldo < 0) {
    const autorizacion = await prisma.vacaciones.findFirst({
      where: { colaboradorId, estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] }, observaciones: { contains: 'autorizó por escrito' } },
    })
    if (autorizacion) diasVacaciones = saldoVac.saldo
  }

  return liquidacionDefinitiva({
    salarioBase: Number(contrato.salarioBase),
    promedioVariable: Number(comisiones._avg.valor ?? 0),
    fechaIngreso: colab.fechaIngreso,
    fechaRetiro,
    tipo,
    tipoContrato: contrato.tipo,
    fechaFinContrato: contrato.fechaFin,
    diasVacacionesPendientes: diasVacaciones,
    saldoPrestamo: Number(saldoPrestamo._sum.saldo ?? 0),
    smmlv: parametros.SMMLV,
  })
}

/** Procesos disciplinarios CERRADOS de un colaborador (para sustentar una justa causa). */
export const listarProcesosCerrados = accion(
  { modulo: 'terminaciones', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid() }) },
  async ({ colaboradorId }) => {
    const procesos = await prisma.procesoDisciplinario.findMany({
      where: { colaboradorId, cerrado: true },
      orderBy: { fechaApertura: 'desc' },
      select: { id: true, asunto: true, fechaApertura: true, decision: true },
    })
    return {
      procesos: procesos.map((p) => ({
        id: p.id,
        asunto: p.asunto,
        fecha: p.fechaApertura.toISOString().slice(0, 10),
        decision: p.decision,
      })),
    }
  },
)

export const verificarItemPazSalvo = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ itemId: z.uuid(), cumplido: z.boolean(), observacion: z.string().max(300).optional() }) },
  async (d, usuario) => {
    await dbAuditado.pazYSalvoItem.update({
      where: { id: d.itemId },
      data: { cumplido: d.cumplido, observacion: d.observacion, verificadoPorId: usuario.id, verificadoEn: new Date() },
    })
    // Si todos los ítems están cumplidos, marcar paz y salvo COMPLETO
    const item = await prisma.pazYSalvoItem.findUniqueOrThrow({ where: { id: d.itemId } })
    const pendientes = await prisma.pazYSalvoItem.count({ where: { pazYSalvoId: item.pazYSalvoId, cumplido: false } })
    await prisma.pazYSalvo.update({ where: { id: item.pazYSalvoId }, data: { estado: pendientes === 0 ? 'COMPLETO' : 'PENDIENTE' } })
    revalidatePath('/terminaciones')
    return { ok: true }
  },
)

export const cerrarTerminacion = accion(
  { modulo: 'terminaciones', accion: 'APROBAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const t = await prisma.terminacion.findUniqueOrThrow({ where: { id }, include: { pazYSalvo: { include: { items: true } } } })
    const pendientes = t.pazYSalvo?.items.filter((i) => !i.cumplido).length ?? 0
    if (pendientes > 0) throw new ErrorNegocio('No puedes cerrar la terminación con ítems de paz y salvo pendientes.')
    // No cerrar mientras el colaborador tenga liquidaciones en un periodo de
    // nómina abierto: podría recalcularse y cambiar lo que se le debe.
    const nominaAbierta = await prisma.liquidacionNomina.findFirst({
      where: { colaboradorId: t.colaboradorId, periodo: { estado: { notIn: ['CERRADA', 'PAGADA'] } } },
      include: { periodo: { select: { nombre: true } } },
    })
    if (nominaAbierta) {
      throw new ErrorNegocio(
        `El colaborador tiene liquidación en el periodo de nómina abierto "${nominaAbierta.periodo.nombre}". Cierra o paga ese periodo antes de cerrar la terminación.`,
      )
    }
    await dbAuditado.terminacion.update({ where: { id }, data: { estado: 'CERRADA' } })
    revalidatePath('/terminaciones')
  },
)

/**
 * Rehace el cálculo de la liquidación con los datos que hay HOY.
 *
 * Las cifras se calculan al registrar la terminación y quedan congeladas. Si
 * después se corrige el salario del contrato, la fecha de retiro o aparece una
 * novedad del último periodo, esas cifras se vuelven falsas y no había forma de
 * arreglarlas: tocaba registrar otra terminación y dejar la mala en la base.
 *
 * Solo mientras la terminación NO esté cerrada: una vez cerrada ya se pagó y se
 * firmó el paz y salvo, y corregir eso es una nota contable, no un botón.
 */
export const recalcularLiquidacion = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ id: z.uuid(), fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) },
  async (d) => {
    const t = await prisma.terminacion.findUniqueOrThrow({ where: { id: d.id } })
    if (t.estado === 'CERRADA') {
      throw new ErrorNegocio('La terminación ya está cerrada: sus cifras no se pueden rehacer. Si hay un error, corrígelo por nota contable.')
    }

    const contrato = await prisma.contrato.findFirst({
      where: { colaboradorId: t.colaboradorId },
      orderBy: [{ estado: 'asc' }, { fechaInicio: 'desc' }],
    })
    if (!contrato) throw new ErrorNegocio('El colaborador no tiene contrato: no hay con qué calcular la liquidación.')

    // La fecha de retiro puede corregirse aquí mismo: es el dato que más se
    // digita mal y el que más mueve las cifras (días de cesantías, prima y
    // vacaciones salen de él).
    const fechaRetiro = d.fechaRetiro ? parseFechaISO(d.fechaRetiro)! : t.fechaRetiro
    const calculo = await calcularLiq(t.colaboradorId, contrato, fechaRetiro, t.tipo)

    await dbAuditado.terminacion.update({
      where: { id: d.id },
      data: { fechaRetiro, indemnizacion: calculo.indemnizacion, estado: 'LIQUIDADA' },
    })

    const datos = {
      diasLiquidados: calculo.diasLiquidados,
      salarioBase: contrato.salarioBase,
      cesantias: calculo.cesantias,
      interesesCesantias: calculo.interesesCesantias,
      prima: calculo.prima,
      vacaciones: calculo.vacaciones,
      indemnizacion: calculo.indemnizacion,
      deducciones: calculo.deducciones,
      total: calculo.total,
      detalle: calculo as object,
    }
    // Puede no existir: si al registrar la terminación no había contrato activo,
    // la terminación quedó EN_PROCESO y sin liquidación.
    const previa = await prisma.liquidacionDefinitiva.findFirst({ where: { terminacionId: d.id } })
    if (previa) {
      await dbAuditado.liquidacionDefinitiva.update({ where: { id: previa.id }, data: datos })
    } else {
      await dbAuditado.liquidacionDefinitiva.create({ data: { terminacionId: d.id, ...datos } })
    }

    revalidatePath('/terminaciones')
    revalidatePath(`/terminaciones/${d.id}`)
    return { total: Number(calculo.total) }
  },
)

/**
 * Anula una terminación registrada por error y devuelve al colaborador a activo.
 *
 * Registrar una terminación equivocada era irreversible: bloqueaba registrar la
 * correcta —solo se admite una abierta por persona— y dejaba a la persona
 * inactiva. Se borra en cascada con su liquidación y su paz y salvo, porque son
 * datos de un hecho que no ocurrió, no historial que valga la pena conservar.
 */
export const anularTerminacion = accion(
  { modulo: 'terminaciones', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se anula').max(300) }) },
  async ({ id, motivo }) => {
    const t = await prisma.terminacion.findUniqueOrThrow({ where: { id } })
    if (t.estado === 'CERRADA') {
      throw new ErrorNegocio('Una terminación cerrada no se anula: ya se liquidó y se firmó el paz y salvo.')
    }

    // Queda en auditoría con el motivo antes de borrar: el registro desaparece,
    // pero la constancia de que existió y por qué se anuló, no.
    await auditar('ELIMINAR', 'Terminacion', {
      registroId: id,
      descripcion: `Terminación anulada (${t.tipo}, retiro ${formatFechaISO(t.fechaRetiro)}). Motivo: ${motivo}`,
    })

    await prisma.liquidacionDefinitiva.deleteMany({ where: { terminacionId: id } })
    const pyS = await prisma.pazYSalvo.findFirst({ where: { terminacionId: id }, select: { id: true } })
    if (pyS) {
      await prisma.pazYSalvoItem.deleteMany({ where: { pazYSalvoId: pyS.id } })
      await prisma.pazYSalvo.delete({ where: { id: pyS.id } })
    }
    await dbAuditado.terminacion.delete({ where: { id } })

    // Registrar la terminación hace tres cosas más, y anularla tiene que
    // deshacerlas todas: si no, la persona queda a medio restaurar —sin contrato
    // vigente y con el usuario atrapado en solo consulta—, que es peor que el
    // error original.
    await dbAuditado.colaborador.update({
      where: { id: t.colaboradorId },
      data: { estado: 'ACTIVO', fechaRetiro: null },
    })
    // El contrato que se dio por terminado es el último: era el vigente cuando
    // se registró. Solo se reactiva si sigue marcado TERMINADO.
    const contratoTerminado = await prisma.contrato.findFirst({
      where: { colaboradorId: t.colaboradorId, estado: 'TERMINADO' },
      orderBy: { fechaInicio: 'desc' },
      select: { id: true },
    })
    if (contratoTerminado) {
      await dbAuditado.contrato.update({ where: { id: contratoTerminado.id }, data: { estado: 'ACTIVO' } })
    }
    await devolverAccesoNormal(t.colaboradorId)

    revalidatePath('/terminaciones')
    revalidatePath(`/colaboradores/${t.colaboradorId}`)
  },
)

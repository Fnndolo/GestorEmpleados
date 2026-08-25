'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { cargarParametros } from '@/server/nomina/parametros'
import { liquidacionDefinitiva } from '@/server/nomina/liquidacion-definitiva'
import { basesDesdeHistorial, type AjustesBases } from '@/server/nomina/bases-liquidacion'
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

    const contrato = await prisma.contrato.findFirst({ where: { colaboradorId: d.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' } })
    const fechaRetiro = parseFechaISO(d.fechaRetiro)!

    // Cálculo de la liquidación definitiva (borrador para revisión del área contable)
    let liquidacionData: Awaited<ReturnType<typeof calcularLiq>> | null = null
    if (contrato) liquidacionData = await calcularLiq(d.colaboradorId, contrato, fechaRetiro, d.tipo)
    const liq = liquidacionData?.resultado ?? null

    const terminacion = await dbAuditado.terminacion.create({
      data: {
        colaboradorId: d.colaboradorId, tipo: d.tipo, fechaRetiro,
        preavisoDias: d.preavisoDias ?? null,
        procesoDisciplinarioId: d.tipo === 'CON_JUSTA_CAUSA' ? d.procesoDisciplinarioId : null,
        indemnizacion: liq?.indemnizacion ?? null,
        motivo: d.motivo, estado: liq ? 'LIQUIDADA' : 'EN_PROCESO',
      },
    })

    if (liquidacionData && contrato) {
      await prisma.liquidacionDefinitiva.create({
        data: { terminacionId: terminacion.id, ...datosLiquidacion(liquidacionData, contrato.salarioBase) },
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

type ContratoLiq = {
  salarioBase: unknown
  tipo: string
  fechaFin: Date | null
  tieneAuxTransporte: boolean
  tipoSalario: string
}

async function calcularLiq(
  colaboradorId: string,
  contrato: ContratoLiq,
  fechaRetiro: Date,
  tipo: string,
  ajustes: AjustesBases = {},
) {
  const parametros = await cargarParametros(fechaRetiro)
  const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: colaboradorId } })
  // Corte en la fecha de retiro: después de esa fecha ya no se causan vacaciones.
  const saldoVac = await saldoVacaciones(colaboradorId, fechaRetiro)
  const saldoPrestamo = await prisma.prestamo.aggregate({ where: { colaboradorId, estado: 'ACTIVO' }, _sum: { saldo: true } })

  const bases = await basesDesdeHistorial(colaboradorId, contrato, colab.fechaIngreso, fechaRetiro, ajustes)

  // Saldo negativo = tomó vacaciones anticipadas y se retira antes de causarlas.
  // Solo se descuenta si el colaborador lo autorizó por escrito al solicitarlas
  // (RIT art. 69 num. 4: ninguna deducción sin autorización previa y escrita).
  let diasVacaciones = Math.max(0, saldoVac.saldoExacto)
  if (saldoVac.saldo < 0) {
    const autorizacion = await prisma.vacaciones.findFirst({
      where: { colaboradorId, estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] }, observaciones: { contains: 'autorizó por escrito' } },
    })
    if (autorizacion) diasVacaciones = saldoVac.saldoExacto
  }

  const resultado = liquidacionDefinitiva({
    salarioBase: Number(contrato.salarioBase),
    auxilioTransporte: bases.auxilioTransporte,
    promedioVariableAnual: bases.promedioVariableAnual,
    promedioVariableSemestre: bases.promedioVariableSemestre,
    otroConceptoSalarial: bases.otroConceptoSalarial,
    diasSalarioPendiente: bases.diasSalarioPendiente,
    // El variable no entra a la base de vacaciones (criterio del liquidador
    // contable de la empresa). Se deja aquí, visible, para poder cambiarlo.
    variableEnVacaciones: false,
    fechaIngreso: colab.fechaIngreso,
    fechaRetiro,
    tipo,
    tipoContrato: contrato.tipo,
    fechaFinContrato: contrato.fechaFin,
    diasVacacionesPendientes: diasVacaciones,
    saldoPrestamo: Number(saldoPrestamo._sum.saldo ?? 0),
    smmlv: parametros.SMMLV,
    porcentajeSalud: parametros.SALUD_EMPLEADO,
    porcentajePension: parametros.PENSION_EMPLEADO,
    porcentajeInteresesCesantias: parametros.INTERESES_CESANTIAS,
  })

  // Los ajustes viajan con el resultado para que un recálculo posterior no los
  // pierda: si el histórico no está en el sistema, son el único dato que hay.
  return { resultado, bases, ajustes }
}

/**
 * Aplana el cálculo a las columnas de LiquidacionDefinitiva. Las líneas del
 * último tramo —salario, auxilio y variable— van juntas en `otros`, y el desglose
 * completo queda en `detalle` para que la pantalla lo muestre línea por línea.
 */
function datosLiquidacion(calculo: Awaited<ReturnType<typeof calcularLiq>>, salarioBase: unknown) {
  const r = calculo.resultado
  return {
    diasLiquidados: r.diasLiquidados,
    salarioBase: salarioBase as number,
    cesantias: r.cesantias,
    interesesCesantias: r.interesesCesantias,
    prima: r.prima,
    vacaciones: r.vacaciones,
    indemnizacion: r.indemnizacion,
    otros: r.salario + r.auxilioTransporte + r.otroConceptoSalarial,
    deducciones: r.totalDeducciones,
    total: r.total,
    detalle: { ...r, bases: calculo.bases, ajustes: calculo.ajustes } as object,
  }
}

/** Ajustes manuales guardados en un cálculo anterior, para no perderlos al rehacer. */
function ajustesGuardados(detalle: unknown): AjustesBases {
  if (!detalle || typeof detalle !== 'object') return {}
  const a = (detalle as { ajustes?: unknown }).ajustes
  return a && typeof a === 'object' ? (a as AjustesBases) : {}
}

/** Descarta los campos que el formulario mandó vacíos: esos no son un ajuste. */
function limpiarAjustes(d: Record<string, unknown>): AjustesBases {
  const campos = ['auxilioTransporte', 'otroConceptoSalarial', 'diasSalarioPendiente'] as const
  const salida: AjustesBases = {}
  for (const c of campos) if (typeof d[c] === 'number') salida[c] = d[c] as number
  if (Array.isArray(d.variablePorMes)) salida.variablePorMes = d.variablePorMes as AjustesBases['variablePorMes']
  return salida
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
/**
 * Bases que se pueden fijar a mano.
 *
 * Cuando la empresa venía liquidando en otro software, el año en curso no está
 * en el sistema y los promedios salen en cero. Toda migración de nómina resuelve
 * eso igual: se cargan los acumulados del corte. Cadena vacía = "no lo toques",
 * y por eso se distingue de un 0 explícito.
 */
const AJUSTE = z.number().min(0).optional()

export const recalcularLiquidacion = accion(
  {
    modulo: 'terminaciones',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      auxilioTransporte: AJUSTE,
      otroConceptoSalarial: AJUSTE,
      diasSalarioPendiente: AJUSTE,
      // Lo pagado de variable en cada mes. De aquí salen los dos promedios, sin
      // que nadie tenga que dividir nada a mano.
      variablePorMes: z.array(z.object({
        mes: z.string().regex(/^\d{4}-\d{2}$/),
        valor: z.number().min(0),
      })).optional(),
    }),
  },
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

    // Puede no existir: si al registrar la terminación no había contrato activo,
    // la terminación quedó EN_PROCESO y sin liquidación.
    const previa = await prisma.liquidacionDefinitiva.findFirst({ where: { terminacionId: d.id } })

    // Los ajustes que venga trayendo el formulario pisan a los guardados; los que
    // no se toquen se conservan, para que rehacer el cálculo no borre en silencio
    // las cifras que alguien digitó del histórico de otro software.
    const ajustes: AjustesBases = { ...ajustesGuardados(previa?.detalle), ...limpiarAjustes(d) }
    const calculo = await calcularLiq(t.colaboradorId, contrato, fechaRetiro, t.tipo, ajustes)

    await dbAuditado.terminacion.update({
      where: { id: d.id },
      data: { fechaRetiro, indemnizacion: calculo.resultado.indemnizacion, estado: 'LIQUIDADA' },
    })

    const datos = datosLiquidacion(calculo, contrato.salarioBase)
    if (previa) {
      await dbAuditado.liquidacionDefinitiva.update({ where: { id: previa.id }, data: datos })
    } else {
      await dbAuditado.liquidacionDefinitiva.create({ data: { terminacionId: d.id, ...datos } })
    }

    revalidatePath('/terminaciones')
    revalidatePath(`/terminaciones/${d.id}`)
    return { total: Number(calculo.resultado.total) }
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

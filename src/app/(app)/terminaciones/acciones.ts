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
import { devolverAccesoNormal } from '@/server/rol-consulta'
import { enviarDocumentoAFirma, retirarEnvioDocumento, registrarPagoLiquidacion, idDocumentoTerminacion } from '@/server/terminacion-documentos'
import { generarOrdenExamenEgreso, registrarExamenEgreso, cargarSoporteSeguridadSocial } from '@/server/terminacion-pasos'
import { crearItemsPazYSalvo, marcarAreaPazYSalvo } from '@/server/paz-y-salvo-areas'
import { vincularRenuncia, devolverRenuncia as devolverRenunciaServidor } from '@/server/renuncias'
import { CARTA_PRINCIPAL } from '@/lib/terminaciones/cartas'
import { aplicarRetiro, ultimoDiaPasado } from '@/server/terminaciones-retiro'
import { generarYEnviarCodigoFirma, verificarCodigoFirma } from '@/server/firma/codigo-firma'
import { eliminarDocumento } from '@/server/documentos'

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
      // Cuando se registra desde una renuncia presentada en la app.
      renunciaId: z.uuid().optional(),
    }),
  },
  async (d, usuario) => {
    if (d.renunciaId && d.tipo !== 'RENUNCIA_VOLUNTARIA') throw new ErrorNegocio('Una renuncia presentada se registra como renuncia voluntaria.')
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

    // Carta obligatoria según el tipo (aceptación, terminación, no prórroga o mutuo acuerdo).
    await prisma.cartaTerminacion.create({ data: { terminacionId: terminacion.id, tipo: CARTA_PRINCIPAL[d.tipo] ?? 'CARTA_TERMINACION' } })
    // Renuncia presentada en la app: queda aceptada y su carta firmada entra a la terminación.
    if (d.renunciaId) await vincularRenuncia(d.renunciaId, terminacion.id, d.colaboradorId)

    // Paz y salvo: las áreas de Ajustes, con aviso a cada responsable.
    const pazYSalvo = await prisma.pazYSalvo.create({ data: { terminacionId: terminacion.id, estado: 'PENDIENTE' } })
    await crearItemsPazYSalvo({ pazYSalvoId: pazYSalvo.id, terminacionId: terminacion.id, colaboradorId: d.colaboradorId })

    // La fecha de retiro va a la ficha de una vez: es lo que lo saca de la nómina
    // del periodo en que se retira (esos días se pagan en la liquidación). El
    // retiro efectivo —RETIRADO, contrato TERMINADO, OPS cerrados, acceso de solo
    // consulta— espera a que termine su último día: hasta entonces sigue
    // trabajando. Si ese día ya pasó, se aplica ahora; si no, lo aplica el cron.
    await dbAuditado.colaborador.update({ where: { id: d.colaboradorId }, data: { fechaRetiro } })
    const { accesoRestringido } = ultimoDiaPasado(fechaRetiro)
      ? await aplicarRetiro(terminacion.id, usuario.id)
      : { accesoRestringido: false }

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
/** Devuelve la renuncia al trabajador para que la corrija y la presente de nuevo. */
export const devolverRenuncia = accion(
  {
    modulo: 'terminaciones',
    accion: 'CREAR',
    schema: z.object({ renunciaId: z.uuid(), motivo: z.string().trim().min(5, 'Explica qué debe corregir.').max(500) }),
  },
  async (d) => {
    await devolverRenunciaServidor(d.renunciaId, d.motivo)
    revalidatePath('/terminaciones')
  },
)

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
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ itemId: z.uuid(), cumplido: z.boolean() }) },
  async (d, usuario) => {
    await marcarAreaPazYSalvo({ itemId: d.itemId, cumplido: d.cumplido, usuarioId: usuario.id, soloSuya: false })
    revalidatePath('/terminaciones')
    return { ok: true }
  },
)

const TIPO_DOC = z.enum(['CARTA', 'PAZ_Y_SALVO', 'LIQUIDACION'])

/** Código al correo de quien firma por la empresa (Ley 527), antes de enviar el documento. */
export const solicitarCodigoFirmaEmpresa = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ id: z.uuid(), tipo: TIPO_DOC }) },
  async (d, usuario) => {
    const referenciaId = await idDocumentoTerminacion(d.tipo, d.id)
    return generarYEnviarCodigoFirma({ proposito: 'FIRMA_EMPRESA_TERMINACION', referenciaId, userId: usuario.id, email: usuario.email })
  },
)

/** Talento Humano firma por la empresa y envía el documento al trabajador. */
export const enviarDocumentoTerminacion = accion(
  {
    modulo: 'terminaciones',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      tipo: TIPO_DOC,
      firmaDataUri: z.string().min(1).startsWith('data:image/', 'Firma inválida'),
      codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
    }),
  },
  async (d, usuario) => {
    const referenciaId = await idDocumentoTerminacion(d.tipo, d.id)
    await verificarCodigoFirma({ proposito: 'FIRMA_EMPRESA_TERMINACION', referenciaId, userId: usuario.id, codigo: d.codigo })
    await enviarDocumentoAFirma({ tipo: d.tipo, terminacionId: d.id, firmaEmpresaDataUri: d.firmaDataUri, usuarioId: usuario.id, metodoAuth: 'CODIGO_EMAIL' })
    revalidatePath(`/terminaciones/${d.id}`)
  },
)

export const retirarDocumentoTerminacion = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ id: z.uuid(), tipo: TIPO_DOC }) },
  async (d) => {
    await retirarEnvioDocumento(d.tipo, d.id)
    revalidatePath(`/terminaciones/${d.id}`)
  },
)

/** Pago de la liquidación: exige el recibido firmado y el comprobante. */
export const pagarLiquidacion = accion(
  {
    modulo: 'terminaciones',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      comprobante: z.string().startsWith('data:', 'Adjunta el comprobante del pago.'),
      nombreArchivo: z.string().max(200),
    }),
  },
  async (d, usuario) => {
    await registrarPagoLiquidacion({
      terminacionId: d.id, fechaPago: parseFechaISO(d.fechaPago)!, comprobanteDataUri: d.comprobante, nombreArchivo: d.nombreArchivo, usuarioId: usuario.id,
    })
    revalidatePath(`/terminaciones/${d.id}`)
  },
)

export const generarOrdenExamen = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    await generarOrdenExamenEgreso(id, usuario.id)
    revalidatePath(`/terminaciones/${id}`)
  },
)

export const registrarExamen = accion(
  {
    modulo: 'terminaciones',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      realizado: z.boolean(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      concepto: z.enum(['APTO', 'APTO_CON_RECOMENDACIONES', 'NO_APTO', 'APLAZADO']).optional(),
      certificado: z.string().startsWith('data:').optional(),
    }),
  },
  async (d, usuario) => {
    await registrarExamenEgreso({
      terminacionId: d.id, realizado: d.realizado, fecha: parseFechaISO(d.fecha)!, concepto: d.concepto,
      certificadoDataUri: d.certificado ?? null, usuarioId: usuario.id,
    })
    revalidatePath(`/terminaciones/${d.id}`)
  },
)

export const subirSeguridadSocial = accion(
  { modulo: 'terminaciones', accion: 'EDITAR', schema: z.object({ id: z.uuid(), archivo: z.string().startsWith('data:', 'Adjunta el soporte.') }) },
  async (d, usuario) => {
    await cargarSoporteSeguridadSocial(d.id, d.archivo, usuario.id)
    revalidatePath(`/terminaciones/${d.id}`)
  },
)

export const cerrarTerminacion = accion(
  { modulo: 'terminaciones', accion: 'APROBAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const t = await prisma.terminacion.findUniqueOrThrow({ where: { id }, include: { liquidacion: true, cartas: true } })
    // Pasos obligatorios (decisión de empresa): la carta firmada y la liquidación
    // firmada y pagada. El paz y salvo es opcional: hay retiros con plazos tan
    // cortos que no alcanza, y el pago no puede quedar sujeto a él (art. 65 CST).
    const carta = t.cartas.find((c) => c.tipo === (CARTA_PRINCIPAL[t.tipo] ?? 'CARTA_TERMINACION'))
    if (!carta?.firmadoEn) throw new ErrorNegocio('Falta la carta de la terminación firmada por el trabajador.')
    if (t.liquidacion && !t.liquidacion.firmadoEn) throw new ErrorNegocio('Falta que el trabajador firme el recibido de la liquidación.')
    if (t.liquidacion && !t.liquidacion.pagadoEn) throw new ErrorNegocio('Falta registrar el pago de la liquidación con su comprobante.')
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
    if (previa?.enviadoFirmaEn) {
      throw new ErrorNegocio('La liquidación ya se envió a firmar. Retira el envío para rehacer el cálculo.')
    }

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

    const cartas = await prisma.cartaTerminacion.findMany({ where: { terminacionId: id }, select: { documentoId: true, firmadoEn: true, tipo: true } })
    for (const c of cartas) if (c.documentoId && !c.firmadoEn) await eliminarDocumento(c.documentoId).catch(() => {})
    await prisma.renuncia.updateMany({ where: { terminacionId: id }, data: { estado: 'PRESENTADA', terminacionId: null } })
    const liqPrevia = await prisma.liquidacionDefinitiva.findFirst({ where: { terminacionId: id }, select: { documentoId: true, firmadoEn: true } })
    await prisma.liquidacionDefinitiva.deleteMany({ where: { terminacionId: id } })
    if (liqPrevia?.documentoId && !liqPrevia.firmadoEn) await eliminarDocumento(liqPrevia.documentoId).catch(() => {})
    const pyS = await prisma.pazYSalvo.findFirst({ where: { terminacionId: id }, select: { id: true, documentoId: true, firmadoEn: true } })
    if (pyS) {
      await prisma.pazYSalvoItem.deleteMany({ where: { pazYSalvoId: pyS.id } })
      await prisma.pazYSalvo.delete({ where: { id: pyS.id } })
      // El acta sin firmar se va con la terminación; la firmada se queda en el
      // expediente del colaborador, porque es un documento que él ya firmó.
      if (pyS.documentoId && !pyS.firmadoEn) await eliminarDocumento(pyS.documentoId).catch(() => {})
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
    // Si el retiro aún no se aplicaba (su último día no había pasado), no hay
    // contrato, OPS ni acceso que devolver.
    if (t.retiroAplicadoEn) {
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
    // Los OPS que cerró esta terminación (motivo RETIRO en su misma fecha) vuelven
    // al estado que tenían: FIRMADO si ya tenía las firmas, si no ACTIVO.
    const opsCerrados = await prisma.contratoOps.findMany({
      where: { colaboradorId: t.colaboradorId, estado: 'TERMINADO', motivoCierre: 'RETIRO', cerradoEn: t.fechaRetiro },
      select: { id: true, firmaContratistaPath: true, firmaContratantePath: true, firmaContratanteEnPdf: true },
    })
    for (const o of opsCerrados) {
      const firmado = !!o.firmaContratistaPath && (!!o.firmaContratantePath || o.firmaContratanteEnPdf)
      await dbAuditado.contratoOps.update({
        where: { id: o.id },
        data: { estado: firmado ? 'FIRMADO' : 'ACTIVO', cerradoEn: null, motivoCierre: null, cerradoPorId: null, observacionCierre: null },
      })
    }
    await devolverAccesoNormal(t.colaboradorId)
    }

    revalidatePath('/terminaciones')
    revalidatePath(`/colaboradores/${t.colaboradorId}`)
  },
)

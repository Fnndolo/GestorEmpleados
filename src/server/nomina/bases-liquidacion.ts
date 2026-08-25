import 'server-only'
import { prisma } from '@/lib/db'
import { cargarParametros } from './parametros'
import { dias360 } from './liquidacion-definitiva'

/**
 * Insumos variables de una liquidación definitiva: lo que no se lee del contrato
 * sino del histórico de nómina.
 */
export type BasesLiquidacion = {
  auxilioTransporte: number
  /** Promedio mensual del variable en el último año (o el tiempo servido). */
  promedioVariableAnual: number
  /** Promedio mensual del variable en el semestre en curso. */
  promedioVariableSemestre: number
  /** Variable ya causada que ninguna nómina alcanzó a pagar. */
  otroConceptoSalarial: number
  /** Días del último mes que ninguna nómina cubrió. */
  diasSalarioPendiente: number
  /** Periodos de nómina que alimentaron los promedios. */
  periodosConsiderados: number
  /** Hasta dónde llegó la última nómina liquidada. Null si nunca se corrió una. */
  cubiertoHasta: Date | null
}

/** Lo pagado de variable en un mes concreto. `mes` en formato yyyy-mm. */
export type VariableMensual = { mes: string; valor: number }

/**
 * Valores que el usuario puede fijar a mano cuando el histórico no está en el
 * sistema.
 *
 * `variablePorMes` es el camino normal: se digita lo que se pagó cada mes —que
 * es el dato que el contador tiene a la mano— y los promedios salen solos.
 * Los dos promedios sueltos quedan para las liquidaciones que ya se guardaron
 * con ellos, y para el caso raro de que alguien traiga el promedio ya hecho.
 */
export type AjustesBases = Partial<Pick<
  BasesLiquidacion,
  'auxilioTransporte' | 'promedioVariableAnual' | 'promedioVariableSemestre' | 'otroConceptoSalarial' | 'diasSalarioPendiente'
>> & { variablePorMes?: VariableMensual[] }

/** Un mes de la ventana de promedios, para pedirlo en pantalla. */
export type MesDeVentana = {
  mes: string
  etiqueta: string
  /** Si además cuenta para el promedio del semestre (base de la prima). */
  enSemestre: boolean
  /** Lo que el sistema ya sabe de ese mes por los desprendibles emitidos. */
  valorConocido: number
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Clave yyyy-mm de una fecha. */
const claveMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * Conceptos del desprendible que cuentan como salario variable para las bases
 * prestacionales. Se listan por código y no por bandera para no depender de que
 * el catálogo esté bien marcado: son los que el motor emite en código.
 */
const VARIABLE_FIJOS = new Set(['HORAS_EXTRA', 'COMISION', 'BONIFICACION_C'])

const dia = 86_400_000

/**
 * Arma las bases de una liquidación leyendo lo que la nómina ya pagó.
 *
 * La ley mide el salario variable en dos ventanas distintas —el último año para
 * cesantías, el semestre en curso para prima— y de ahí que quien tuvo un buen
 * cierre de año salga con una base de prima bastante mayor. Los promedios se
 * calculan sobre MESES de vínculo, no sobre cuántos registros haya: una comisión
 * suelta cargada una vez no significa que se haya ganado eso todos los meses.
 *
 * Si la empresa venía liquidando en otro software, aquí no habrá histórico y
 * todo saldrá en cero; para eso están los ajustes manuales, que es como toda
 * migración de nómina resuelve el año en curso.
 */
export async function basesDesdeHistorial(
  colaboradorId: string,
  contrato: { salarioBase: unknown; tieneAuxTransporte: boolean; tipoSalario: string },
  fechaIngreso: Date,
  fechaRetiro: Date,
  ajustes: AjustesBases = {},
): Promise<BasesLiquidacion> {
  const parametros = await cargarParametros(fechaRetiro)

  // ── Auxilio de transporte ──
  // Solo salario ordinario y hasta 2 SMMLV (mismo criterio que el motor mensual).
  const salarioBase = Number(contrato.salarioBase)
  const elegibleAuxilio =
    contrato.tieneAuxTransporte &&
    contrato.tipoSalario === 'ORDINARIO' &&
    salarioBase <= parametros.SMMLV * (parametros.AUX_TRANSPORTE_TOPE_SMMLV ?? 2)
  const auxilioTransporte = elegibleAuxilio ? parametros.AUX_TRANSPORTE : 0

  // ── Desprendibles ya emitidos, hasta la fecha de retiro ──
  const liquidaciones = await prisma.liquidacionNomina.findMany({
    where: { colaboradorId, periodo: { fechaFin: { lte: fechaRetiro } } },
    include: {
      periodo: { select: { fechaInicio: true, fechaFin: true } },
      detalles: { select: { conceptoCodigo: true, tipo: true, valor: true } },
    },
    orderBy: { periodo: { fechaFin: 'asc' } },
  })

  // Conceptos configurables marcados como constitutivos: se suman igual que las
  // comisiones porque para la ley son lo mismo, aunque los haya creado el usuario.
  const configurables = await prisma.conceptoNomina.findMany({
    where: { constitutivoSalario: true, tipoCalculo: { not: 'SISTEMA' } },
    select: { codigo: true },
  })
  const esVariable = new Set([...VARIABLE_FIJOS, ...configurables.map((c) => c.codigo)])

  // Variable por mes según los desprendibles emitidos, y encima lo que se haya
  // digitado a mano: un valor escrito es una corrección explícita y manda.
  const porMes = new Map<string, number>()
  for (const l of liquidaciones) {
    const valor = l.detalles
      .filter((d) => d.tipo === 'DEVENGADO' && esVariable.has(d.conceptoCodigo))
      .reduce((t, d) => t + Number(d.valor), 0)
    porMes.set(claveMes(l.periodo.fechaFin), (porMes.get(claveMes(l.periodo.fechaFin)) ?? 0) + valor)
  }
  for (const m of ajustes.variablePorMes ?? []) porMes.set(m.mes, m.valor)

  // ── Ventanas de promedio ──
  const { inicioAnual, inicioSem } = ventanas(fechaIngreso, fechaRetiro)
  const promedioVariableAnual = promedioMensual(porMes, inicioAnual, fechaRetiro)
  const promedioVariableSemestre = promedioMensual(porMes, inicioSem, fechaRetiro)

  // ── Tramo final que ninguna nómina cubrió ──
  const cubiertoHasta = liquidaciones.at(-1)?.periodo.fechaFin ?? null
  const inicioTramo = cubiertoHasta
    ? new Date(cubiertoHasta.getTime() + dia)
    : new Date(Date.UTC(fechaRetiro.getUTCFullYear(), fechaRetiro.getUTCMonth(), 1))
  const diasSalarioPendiente = diasDeSalario(inicioTramo, fechaRetiro)

  // Variable ya registrado en ese tramo pero todavía sin desprendible: se paga
  // en la liquidación, porque la persona sale del ciclo mensual al terminarse
  // el contrato y nadie más se lo va a pagar.
  const otroConceptoSalarial = await variableSinPagar(colaboradorId, inicioTramo, fechaRetiro)

  return aplicarAjustes(
    {
      auxilioTransporte,
      promedioVariableAnual,
      promedioVariableSemestre,
      otroConceptoSalarial,
      diasSalarioPendiente,
      periodosConsiderados: liquidaciones.length,
      cubiertoHasta,
    },
    ajustes,
  )
}

/**
 * Los valores fijados a mano mandan sobre los derivados del histórico.
 *
 * Los promedios sueltos solo se aplican si NO se digitó el detalle mes a mes:
 * si hay meses, ellos son la verdad y un promedio viejo guardado no debe
 * pisarlos —si no, corregir un mes no cambiaría nada y nadie sabría por qué.
 */
function aplicarAjustes(b: BasesLiquidacion, a: AjustesBases): BasesLiquidacion {
  const hayMeses = (a.variablePorMes?.length ?? 0) > 0
  return {
    ...b,
    auxilioTransporte: a.auxilioTransporte ?? b.auxilioTransporte,
    promedioVariableAnual: (hayMeses ? undefined : a.promedioVariableAnual) ?? b.promedioVariableAnual,
    promedioVariableSemestre: (hayMeses ? undefined : a.promedioVariableSemestre) ?? b.promedioVariableSemestre,
    otroConceptoSalarial: a.otroConceptoSalarial ?? b.otroConceptoSalarial,
    diasSalarioPendiente: a.diasSalarioPendiente ?? b.diasSalarioPendiente,
  }
}

/**
 * Las dos ventanas sobre las que se promedia el salario variable: el último año
 * (o el tiempo servido, si es menor) para cesantías, y el semestre en curso
 * para la prima.
 */
function ventanas(fechaIngreso: Date, fechaRetiro: Date) {
  const anioRetiro = fechaRetiro.getUTCFullYear()
  const inicioSemestre = new Date(Date.UTC(anioRetiro, fechaRetiro.getUTCMonth() < 6 ? 0 : 6, 1))
  const haceUnAnio = new Date(fechaRetiro.getTime() - 360 * dia)
  return {
    inicioAnual: maximo(fechaIngreso, haceUnAnio),
    inicioSem: maximo(fechaIngreso, inicioSemestre),
  }
}

/** Un mes cuenta en la ventana si su último día cae dentro de ella. */
function mesEnVentana(mes: string, desde: Date, hasta: Date): boolean {
  const [a, m] = mes.split('-').map(Number)
  const finDelMes = new Date(Date.UTC(a, m, 0))
  return finDelMes >= desde && finDelMes <= new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0))
}

/**
 * Promedio MENSUAL del variable en una ventana: lo devengado dentro de ella
 * dividido por los MESES que abarca. Dividir por la cantidad de registros —el
 * error clásico— convierte una comisión cargada una sola vez en un sueldo
 * variable permanente.
 */
function promedioMensual(porMes: Map<string, number>, desde: Date, hasta: Date): number {
  const meses = dias360(desde, hasta) / 30
  if (meses <= 0) return 0
  let total = 0
  for (const [mes, valor] of porMes) if (mesEnVentana(mes, desde, hasta)) total += valor
  if (total === 0) return 0
  return Math.round(total / meses)
}

/**
 * Meses que hay que preguntar para armar los promedios, con lo que el sistema ya
 * sabe de cada uno.
 *
 * Se pide el pago mes a mes —el dato que el contador tiene en su registro— en vez
 * del promedio ya calculado: pedirle un promedio es pedirle que haga cuentas, y
 * cuentas hechas a mano es justo lo que este módulo existe para evitar.
 */
export async function mesesParaPromedios(
  colaboradorId: string,
  fechaIngreso: Date,
  fechaRetiro: Date,
): Promise<{ meses: MesDeVentana[]; mesesAnual: number; mesesSemestre: number }> {
  const { inicioAnual, inicioSem } = ventanas(fechaIngreso, fechaRetiro)

  const liquidaciones = await prisma.liquidacionNomina.findMany({
    where: { colaboradorId, periodo: { fechaFin: { lte: fechaRetiro } } },
    include: {
      periodo: { select: { fechaFin: true } },
      detalles: { select: { conceptoCodigo: true, tipo: true, valor: true } },
    },
  })
  const configurables = await prisma.conceptoNomina.findMany({
    where: { constitutivoSalario: true, tipoCalculo: { not: 'SISTEMA' } },
    select: { codigo: true },
  })
  const esVariable = new Set([...VARIABLE_FIJOS, ...configurables.map((c) => c.codigo)])

  const conocido = new Map<string, number>()
  for (const l of liquidaciones) {
    const k = claveMes(l.periodo.fechaFin)
    const valor = l.detalles
      .filter((d) => d.tipo === 'DEVENGADO' && esVariable.has(d.conceptoCodigo))
      .reduce((t, d) => t + Number(d.valor), 0)
    conocido.set(k, (conocido.get(k) ?? 0) + valor)
  }

  const meses: MesDeVentana[] = []
  const cursor = new Date(Date.UTC(inicioAnual.getUTCFullYear(), inicioAnual.getUTCMonth(), 1))
  const tope = new Date(Date.UTC(fechaRetiro.getUTCFullYear(), fechaRetiro.getUTCMonth(), 1))
  while (cursor <= tope) {
    const k = claveMes(cursor)
    meses.push({
      mes: k,
      etiqueta: `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      enSemestre: mesEnVentana(k, inicioSem, fechaRetiro),
      valorConocido: conocido.get(k) ?? 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return {
    meses,
    mesesAnual: dias360(inicioAnual, fechaRetiro) / 30,
    mesesSemestre: dias360(inicioSem, fechaRetiro) / 30,
  }
}

/** Comisiones y bonificaciones registradas en el tramo final y aún sin pagar. */
async function variableSinPagar(colaboradorId: string, desde: Date, hasta: Date): Promise<number> {
  if (desde > hasta) return 0
  const [comisiones, bonificaciones] = await Promise.all([
    prisma.comision.aggregate({
      where: { colaboradorId, periodo: { fechaFin: { gte: desde, lte: hasta } } },
      _sum: { valor: true },
    }),
    prisma.bonificacion.aggregate({
      where: { colaboradorId, estadoPago: 'PENDIENTE', constitutivoSalario: true },
      _sum: { valor: true },
    }),
  ])
  return Number(comisiones._sum.valor ?? 0) + Number(bonificaciones._sum.valor ?? 0)
}

/**
 * Días de salario entre dos fechas, ambas inclusive, en meses de 30 días.
 *
 * A diferencia de dias360 —que mide plazos y por eso no cuenta el día inicial—,
 * aquí se cuentan días trabajados: del 1 al 10 son 10 días de sueldo, no 9. Y un
 * mes completo son siempre 30, trátese de febrero o de julio: el día 31 se paga
 * dentro del mes y el 29 y 30 de febrero se pagan aunque no existan.
 */
export function diasDeSalario(desde: Date, hasta: Date): number {
  if (hasta < desde) return 0
  const finDeMes = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0)).getUTCDate()
  const d1 = Math.min(desde.getUTCDate(), 30)
  const d2 = hasta.getUTCDate() === finDeMes ? 30 : Math.min(hasta.getUTCDate(), 30)
  const meses = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth())
  return Math.max(0, meses * 30 + (d2 - d1) + 1)
}

const maximo = (a: Date, b: Date) => (a > b ? a : b)

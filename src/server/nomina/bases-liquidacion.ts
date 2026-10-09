import 'server-only'
import { prisma } from '@/lib/db'
import { cargarTiposHora } from './parametros'
import { horasMesJornada } from './horas'
import { diasDeSalario } from './liquidacion-definitiva'
import { ErrorNegocio } from '@/server/accion'
import { referenciaLiquidacion, type ReferenciaLiquidacion } from './referencia-liquidacion'

export { diasDeSalario }

/**
 * Bases de una liquidación definitiva recuperadas del histórico de nómina.
 */
export type BasesLiquidacion = {
  salarioBase: number
  origenSalario: 'NOMINA' | 'MANUAL'
  origenAuxilio: 'NOMINA' | 'MANUAL'
  referencia: ReferenciaLiquidacion
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
  'promedioVariableAnual' | 'promedioVariableSemestre' | 'otroConceptoSalarial' | 'diasSalarioPendiente'
>> & { salarioBase?: number | null; auxilioTransporte?: number | null; variablePorMes?: VariableMensual[] }

/** Permite registrar la terminación y completar sus valores antes de liquidar. */
export class ErrorBasesLiquidacion extends ErrorNegocio {}

const INCLUIR_NOMINA = {
  periodo: { select: { nombre: true, fechaInicio: true, fechaFin: true, esAjuste: true, parametrosSnapshot: true } },
  detalles: { select: { conceptoCodigo: true, tipo: true, valor: true, base: true } },
} as const

/** Nóminas registradas hasta el retiro; un borrador no es una referencia salarial. */
function nominasAnteriores(colaboradorId: string, fechaRetiro: Date) {
  return prisma.liquidacionNomina.findMany({
    where: { colaboradorId, periodo: { fechaFin: { lte: fechaRetiro }, estado: { not: 'BORRADOR' } } },
    include: INCLUIR_NOMINA,
    orderBy: { periodo: { fechaFin: 'asc' } },
  })
}

/** Un mes de la ventana de promedios, para pedirlo en pantalla. */
export type MesDeVentana = {
  mes: string
  etiqueta: string
  /** Si además cuenta para el promedio del semestre (base de la prima). */
  enSemestre: boolean
  /** Lo que el sistema ya sabe de ese mes por los desprendibles emitidos. */
  valorConocido: number
  tieneNomina: boolean
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
 * Si la empresa venía liquidando en otro software, se requieren salario y
 * auxilio manuales. Los conceptos variables faltantes se completan por mes.
 */
export async function basesDesdeHistorial(
  colaboradorId: string,
  fechaIngreso: Date,
  fechaRetiro: Date,
  ajustes: AjustesBases = {},
): Promise<BasesLiquidacion> {
  // El contrato describe el vínculo, pero no reemplaza una nómina histórica.
  const liquidaciones = await nominasAnteriores(colaboradorId, fechaRetiro)
  const referencia = referenciaLiquidacion(liquidaciones, fechaRetiro)
  const salarioBase = ajustes.salarioBase ?? referencia.salarioBase
  const auxilioTransporte = ajustes.auxilioTransporte ?? referencia.auxilioTransporte
  if (salarioBase == null || auxilioTransporte == null) {
    const faltantes = [salarioBase == null ? 'salario base mensual' : null, auxilioTransporte == null ? 'auxilio de transporte mensual (0 si no corresponde)' : null].filter(Boolean)
    throw new ErrorBasesLiquidacion(`Falta el ${faltantes.join(' y el ')}. Ingresa estos valores en «Rehacer el cálculo»: no hay una nómina de referencia del año del retiro que los establezca.`)
  }

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
  const cubiertoHasta = liquidaciones.filter((l) => !l.periodo.esAjuste).at(-1)?.periodo.fechaFin ?? null
  const inicioTramo = cubiertoHasta
    ? new Date(cubiertoHasta.getTime() + dia)
    : new Date(Date.UTC(fechaRetiro.getUTCFullYear(), fechaRetiro.getUTCMonth(), 1))
  const diasSalarioPendiente = diasDeSalario(inicioTramo, fechaRetiro)

  // Variable ya registrado en ese tramo pero todavía sin desprendible: se paga
  // en la liquidación, porque la persona sale del ciclo mensual al terminarse
  // el contrato y nadie más se lo va a pagar.
  const otroConceptoSalarial = await variableSinPagar(colaboradorId, fechaRetiro, salarioBase)

  return aplicarAjustes(
    {
      salarioBase,
      origenSalario: ajustes.salarioBase != null ? 'MANUAL' : 'NOMINA',
      origenAuxilio: ajustes.auxilioTransporte != null ? 'MANUAL' : 'NOMINA',
      referencia,
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
  const meses = diasDeSalario(desde, hasta) / 30
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
): Promise<{ meses: MesDeVentana[]; mesesAnual: number; mesesSemestre: number; referencia: ReferenciaLiquidacion }> {
  const { inicioAnual, inicioSem } = ventanas(fechaIngreso, fechaRetiro)

  const liquidaciones = await nominasAnteriores(colaboradorId, fechaRetiro)
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
      tieneNomina: conocido.has(k),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return {
    meses,
    referencia: referenciaLiquidacion(liquidaciones, fechaRetiro),
    mesesAnual: diasDeSalario(inicioAnual, fechaRetiro) / 30,
    mesesSemestre: diasDeSalario(inicioSem, fechaRetiro) / 30,
  }
}

/**
 * Variable ya causado que ninguna nómina alcanzó a pagar: lo que se le queda
 * debiendo a quien se retira antes del cierre del mes.
 *
 * Se busca por `periodoId: null` —la marca de «sin pagar»— y no por rango de
 * periodos: justamente lo que se persigue es lo que quedó suelto. Las horas
 * extra se valoran con el mismo criterio del motor mensual.
 */
async function variableSinPagar(
  colaboradorId: string,
  hasta: Date,
  salarioMensual: number,
): Promise<number> {
  const [comisiones, bonificaciones, horas, conceptos] = await Promise.all([
    prisma.comision.aggregate({
      where: { colaboradorId, periodoId: null, fecha: { lte: hasta } },
      _sum: { valor: true },
    }),
    prisma.bonificacion.aggregate({
      where: { colaboradorId, estadoPago: 'PENDIENTE', constitutivoSalario: true },
      _sum: { valor: true },
    }),
    prisma.novedadHoras.findMany({
      where: { colaboradorId, periodoId: null, fecha: { lte: hasta } },
      select: { tipoHora: true, horas: true },
    }),
    prisma.novedadConcepto.findMany({
      where: { colaboradorId, periodoId: null, fecha: { lte: hasta } },
      include: { concepto: { select: { tipo: true, constitutivoSalario: true, activo: true } } },
    }),
  ])

  let valorHoras = 0
  if (horas.length > 0) {
    const tipos = await cargarTiposHora(hasta)
    const valorHora = salarioMensual / horasMesJornada(hasta)
    for (const h of horas) valorHoras += valorHora * (tipos[h.tipoHora] ?? 0) * Number(h.horas)
  }

  const valorConceptos = conceptos
    .filter((n) => n.concepto.activo && n.concepto.tipo === 'DEVENGADO' && n.concepto.constitutivoSalario)
    .reduce((t, n) => t + Number(n.valor), 0)

  return Math.round(
    Number(comisiones._sum.valor ?? 0) +
    Number(bonificaciones._sum.valor ?? 0) +
    valorHoras + valorConceptos,
  )
}


const maximo = (a: Date, b: Date) => (a > b ? a : b)

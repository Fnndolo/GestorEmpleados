import Decimal from 'decimal.js'
import type { ParametrosNomina } from './parametros'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export type EntradaLiquidacion = {
  salarioBase: number
  tipoSalario: 'ORDINARIO' | 'INTEGRAL'
  tieneAuxTransporte: boolean
  auxConectividad: number
  diasTrabajados: number
  diasPeriodo: number
  valorHorasExtra: number
  comisiones: number
  bonificacionConstitutiva: number
  bonificacionNoConstitutiva: number
  valorIncapacidad: number
  /** Pago anticipado de vacaciones que inician después de este periodo (RIT arts. 34 y 42). */
  valorVacacionesAnticipadas?: number
  /**
   * Conceptos configurables del catálogo aplicados al colaborador este periodo.
   * Cada uno trae sus banderas (art. 127/128 CST): si es constitutivo/afecta IBC
   * entra a seguridad social; basePrestaciones/baseVacaciones alimentan provisiones.
   */
  otrosConceptos?: {
    codigo: string
    nombre: string
    tipo: 'DEVENGADO' | 'DEDUCCION'
    valor: number
    afectaIbcSs: boolean
    basePrestaciones: boolean
    baseVacaciones: boolean
  }[]
  cuotaPrestamo: number
  claseRiesgoArl: 'I' | 'II' | 'III' | 'IV' | 'V'
  empresaExonerada: boolean
  aplicaRetefuente: boolean
  parametros: ParametrosNomina
}

export type LineaLiquidacion = {
  codigo: string
  nombre: string
  tipo: 'DEVENGADO' | 'DEDUCCION' | 'PROVISION' | 'APORTE_PATRONAL'
  cantidad?: number
  base?: number
  factor?: number
  valor: number
}

export type ResultadoLiquidacion = {
  lineas: LineaLiquidacion[]
  ibc: number
  totalDevengado: number
  totalDeducido: number
  totalProvisiones: number
  totalAportes: number
  neto: number
}

const peso = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
const round100up = (d: Decimal) => d.dividedBy(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(100).toNumber()

/** Motor de liquidación de un colaborador para un periodo. Puro y determinista. */
export function liquidar(e: EntradaLiquidacion): ResultadoLiquidacion {
  const p = e.parametros
  const SMMLV = new Decimal(p.SMMLV)
  const salarioBase = new Decimal(e.salarioBase)
  const valorDia = salarioBase.dividedBy(30)

  const lineas: LineaLiquidacion[] = []
  const dev: Decimal[] = []
  const ded: Decimal[] = []
  const prov: Decimal[] = []
  const apo: Decimal[] = []

  // ── Devengados ──
  const salario = valorDia.times(e.diasTrabajados)
  agregar(lineas, dev, 'SALARIO', 'Salario básico', 'DEVENGADO', peso(salario), { cantidad: e.diasTrabajados, base: e.salarioBase })

  // Auxilio de transporte (si el contrato lo incluye, ≤ 2 SMMLV, ordinario, proporcional a días)
  let auxTransporte = new Decimal(0)
  if (e.tieneAuxTransporte && e.tipoSalario === 'ORDINARIO' && salarioBase.lessThanOrEqualTo(SMMLV.times(p.AUX_TRANSPORTE_TOPE_SMMLV ?? 2))) {
    auxTransporte = new Decimal(p.AUX_TRANSPORTE).dividedBy(30).times(e.diasTrabajados)
    agregar(lineas, dev, 'AUX_TRANSPORTE', 'Auxilio de transporte', 'DEVENGADO', peso(auxTransporte))
  }

  // Auxilio de conectividad (valor manual, no constitutivo: no entra al IBC ni a prestaciones)
  let auxConectividad = new Decimal(0)
  if (e.auxConectividad > 0) {
    auxConectividad = new Decimal(e.auxConectividad).dividedBy(30).times(e.diasTrabajados)
    agregar(lineas, dev, 'AUX_CONECTIVIDAD', 'Auxilio de conectividad', 'DEVENGADO', peso(auxConectividad))
  }

  if (e.valorHorasExtra > 0) agregar(lineas, dev, 'HORAS_EXTRA', 'Horas extra y recargos', 'DEVENGADO', e.valorHorasExtra)
  if (e.comisiones > 0) agregar(lineas, dev, 'COMISION', 'Comisiones', 'DEVENGADO', e.comisiones)
  if (e.bonificacionConstitutiva > 0) agregar(lineas, dev, 'BONIFICACION_C', 'Bonificación constitutiva', 'DEVENGADO', e.bonificacionConstitutiva)
  if (e.bonificacionNoConstitutiva > 0) agregar(lineas, dev, 'BONIFICACION_NC', 'Bonificación no constitutiva', 'DEVENGADO', e.bonificacionNoConstitutiva)
  if (e.valorIncapacidad > 0) agregar(lineas, dev, 'INCAPACIDAD', 'Incapacidad', 'DEVENGADO', e.valorIncapacidad)
  // Vacaciones pagadas por adelantado (antes de la fecha de salida). Son salario
  // durante el descanso (RIT art. 42), así que entran al IBC.
  const vacacionesAnticipadas = e.valorVacacionesAnticipadas ?? 0
  if (vacacionesAnticipadas > 0) agregar(lineas, dev, 'VACACIONES_ANTICIPADAS', 'Vacaciones (pago anticipado)', 'DEVENGADO', vacacionesAnticipadas)

  // Conceptos configurables del catálogo (devengados aquí; deducciones más abajo).
  const conceptos = e.otrosConceptos ?? []
  let conceptosIbc = 0, conceptosPrest = 0, conceptosVac = 0
  for (const c of conceptos.filter((x) => x.tipo === 'DEVENGADO' && x.valor > 0)) {
    agregar(lineas, dev, c.codigo, c.nombre, 'DEVENGADO', c.valor)
    if (c.afectaIbcSs) conceptosIbc += c.valor
    if (c.basePrestaciones) conceptosPrest += c.valor
    if (c.baseVacaciones) conceptosVac += c.valor
  }

  // ── IBC (base de seguridad social) ──
  let ibc: Decimal
  const constitutivo = salario
    .plus(e.valorHorasExtra)
    .plus(e.comisiones)
    .plus(e.bonificacionConstitutiva)
    .plus(e.valorIncapacidad)
    .plus(vacacionesAnticipadas)
    .plus(conceptosIbc)
  if (e.tipoSalario === 'INTEGRAL') {
    ibc = salario.times(0.7).plus(e.valorHorasExtra).plus(e.comisiones)
  } else {
    ibc = constitutivo
  }
  // Piso: 1 SMMLV proporcional; techo: 25 SMMLV
  const ibcMin = SMMLV.dividedBy(30).times(e.diasTrabajados)
  const ibcMax = SMMLV.times(25)
  if (ibc.lessThan(ibcMin)) ibc = ibcMin
  if (ibc.greaterThan(ibcMax)) ibc = ibcMax
  const ibcRedondeado = round100up(ibc)
  const ibcDec = new Decimal(ibcRedondeado)

  // ── Deducciones ──
  const salud = ibcDec.times(p.SALUD_EMPLEADO)
  agregar(lineas, ded, 'SALUD_EMP', 'Salud empleado (4%)', 'DEDUCCION', peso(salud), { base: ibcRedondeado, factor: p.SALUD_EMPLEADO })
  const pension = ibcDec.times(p.PENSION_EMPLEADO)
  agregar(lineas, ded, 'PENSION_EMP', 'Pensión empleado (4%)', 'DEDUCCION', peso(pension), { base: ibcRedondeado, factor: p.PENSION_EMPLEADO })

  // FSP: si el IBC mensualizado ≥ 4 SMMLV.
  //
  // El umbral se mide sobre el IBC REAL, no sobre el redondeado a centenas: ese
  // redondeo es una convención para reportar (PILA), y a ciertos salarios baja
  // la cifra unos pesos. Quien gana exactamente 4 SMMLV tiene un IBC de
  // 7.003.620 que redondeado queda en 7.003.600, y por 20 pesos se libraba de un
  // aporte que la ley sí le exige (Ley 797 de 2003).
  const ibcMensual = e.diasTrabajados > 0 ? ibc.times(30).dividedBy(e.diasTrabajados) : ibc
  if (ibcMensual.greaterThanOrEqualTo(SMMLV.times(4))) {
    const fsp = ibcDec.times(p.FSP)
    agregar(lineas, ded, 'FSP_EMP', 'Fondo de solidaridad pensional', 'DEDUCCION', peso(fsp), { base: ibcRedondeado, factor: p.FSP })
  }

  // Retención en la fuente (procedimiento 1 simplificado, opcional)
  if (e.aplicaRetefuente) {
    const totalDev = dev.reduce((a, b) => a.plus(b), new Decimal(0))
    const rete = retencionFuente(totalDev.minus(auxTransporte).minus(auxConectividad).minus(salud).minus(pension), p.UVT)
    if (rete > 0) agregar(lineas, ded, 'RETEFUENTE', 'Retención en la fuente', 'DEDUCCION', rete)
  }

  if (e.cuotaPrestamo > 0) agregar(lineas, ded, 'PRESTAMO', 'Cuota de préstamo', 'DEDUCCION', e.cuotaPrestamo)

  // Deducciones configurables del catálogo (descuentos autorizados: art. 69 num. 4 RIT).
  for (const c of conceptos.filter((x) => x.tipo === 'DEDUCCION' && x.valor > 0)) {
    agregar(lineas, ded, c.codigo, c.nombre, 'DEDUCCION', c.valor)
  }

  // ── Provisiones (no afectan el neto) ──
  const basePrest = salario.plus(e.valorHorasExtra).plus(e.comisiones).plus(e.bonificacionConstitutiva).plus(auxTransporte).plus(conceptosPrest)
  const baseVac = salario.plus(e.valorHorasExtra).plus(e.comisiones).plus(e.bonificacionConstitutiva).plus(conceptosVac)
  if (e.tipoSalario === 'ORDINARIO') {
    agregar(lineas, prov, 'PROV_CESANTIAS', 'Provisión cesantías', 'PROVISION', peso(basePrest.times(p.CESANTIAS)), { base: peso(basePrest), factor: p.CESANTIAS })
    agregar(lineas, prov, 'PROV_INT_CESANTIAS', 'Provisión intereses cesantías', 'PROVISION', peso(basePrest.times(p.CESANTIAS).times(p.INTERESES_CESANTIAS)))
    agregar(lineas, prov, 'PROV_PRIMA', 'Provisión prima', 'PROVISION', peso(basePrest.times(p.PRIMA)), { base: peso(basePrest), factor: p.PRIMA })
    agregar(lineas, prov, 'PROV_VACACIONES', 'Provisión vacaciones', 'PROVISION', peso(baseVac.times(p.VACACIONES)), { base: peso(baseVac), factor: p.VACACIONES })
  }

  // ── Aportes patronales (sobre IBC) ──
  const exonerado = e.empresaExonerada && salarioBase.lessThan(SMMLV.times(p.EXONERACION_SMMLV ?? 10))
  if (!exonerado) agregar(lineas, apo, 'APORTE_SALUD', 'Aporte salud empleador', 'APORTE_PATRONAL', round100up(ibcDec.times(p.SALUD_EMPLEADOR)))
  agregar(lineas, apo, 'APORTE_PENSION', 'Aporte pensión empleador', 'APORTE_PATRONAL', round100up(ibcDec.times(p.PENSION_EMPLEADOR)))
  const tarifaArl = p[`ARL_${e.claseRiesgoArl}`] ?? p.ARL_I
  agregar(lineas, apo, 'APORTE_ARL', 'Aporte ARL', 'APORTE_PATRONAL', round100up(ibcDec.times(tarifaArl)))
  agregar(lineas, apo, 'APORTE_CAJA', 'Aporte caja de compensación', 'APORTE_PATRONAL', round100up(ibcDec.times(p.CAJA)))
  if (!exonerado) {
    agregar(lineas, apo, 'APORTE_SENA', 'Aporte SENA', 'APORTE_PATRONAL', round100up(ibcDec.times(p.SENA)))
    agregar(lineas, apo, 'APORTE_ICBF', 'Aporte ICBF', 'APORTE_PATRONAL', round100up(ibcDec.times(p.ICBF)))
  }

  const totalDevengado = dev.reduce((a, b) => a.plus(b), new Decimal(0))
  const totalDeducido = ded.reduce((a, b) => a.plus(b), new Decimal(0))
  const totalProvisiones = prov.reduce((a, b) => a.plus(b), new Decimal(0))
  const totalAportes = apo.reduce((a, b) => a.plus(b), new Decimal(0))

  return {
    lineas,
    ibc: ibcRedondeado,
    totalDevengado: peso(totalDevengado),
    totalDeducido: peso(totalDeducido),
    totalProvisiones: peso(totalProvisiones),
    totalAportes: peso(totalAportes),
    neto: peso(totalDevengado.minus(totalDeducido)),
  }
}

function agregar(
  lineas: LineaLiquidacion[],
  bucket: Decimal[],
  codigo: string,
  nombre: string,
  tipo: LineaLiquidacion['tipo'],
  valor: number,
  extra: { cantidad?: number; base?: number; factor?: number } = {},
) {
  lineas.push({ codigo, nombre, tipo, valor, ...extra })
  bucket.push(new Decimal(valor))
}

/** Retención en la fuente procedimiento 1 (tabla art. 383 ET, en UVT). */
export function retencionFuente(baseGravable: Decimal, uvt: number): number {
  if (baseGravable.lessThanOrEqualTo(0)) return 0
  // Renta exenta 25% (tope 790 UVT/12 mensual)
  const rentaExenta = Decimal.min(baseGravable.times(0.25), new Decimal(uvt).times(790).dividedBy(12))
  const base = baseGravable.minus(rentaExenta)
  const baseUVT = base.dividedBy(uvt)

  let impuestoUVT = new Decimal(0)
  const b = baseUVT.toNumber()
  if (b <= 95) impuestoUVT = new Decimal(0)
  else if (b <= 150) impuestoUVT = baseUVT.minus(95).times(0.19)
  else if (b <= 360) impuestoUVT = baseUVT.minus(150).times(0.28).plus(10)
  else if (b <= 640) impuestoUVT = baseUVT.minus(360).times(0.33).plus(69)
  else if (b <= 945) impuestoUVT = baseUVT.minus(640).times(0.35).plus(162)
  else if (b <= 2300) impuestoUVT = baseUVT.minus(945).times(0.37).plus(268)
  else impuestoUVT = baseUVT.minus(2300).times(0.39).plus(770)

  return impuestoUVT.times(uvt).dividedBy(1000).round().times(1000).toNumber()
}

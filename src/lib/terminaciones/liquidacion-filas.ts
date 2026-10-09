/**
 * Filas de la liquidación definitiva (ingresos, deducciones y totales) tal como
 * las revisa el contador. Puras: las comparten la pantalla de la terminación y
 * el PDF que firma el trabajador, así lo que se ve es exactamente lo que se firma.
 */

/** Desglose guardado por el calculador. Puede faltar en liquidaciones antiguas. */
export type DetalleLiquidacion = {
  salario?: number
  auxilioTransporte?: number
  otroConceptoSalarial?: number
  salud?: number
  pension?: number
  saldoPrestamo?: number
  totalDevengado?: number
  totalDeducciones?: number
  diasSalario?: number
  diasCesantias?: number
  diasPrima?: number
  baseCesantias?: number
  basePrima?: number
  baseVacaciones?: number
  baseSeguridadSocial?: number
  ajustes?: { salarioBase?: number | null; auxilioTransporte?: number | null; variablePorMes?: { mes: string; valor: number }[] }
  bases?: {
    salarioBase?: number
    origenSalario?: 'NOMINA' | 'MANUAL'
    origenAuxilio?: 'NOMINA' | 'MANUAL'
    referencia?: { periodoNombre: string | null; fechaReferencia: string | null }
    auxilioTransporte?: number
    promedioVariableAnual?: number
    promedioVariableSemestre?: number
    otroConceptoSalarial?: number
    diasSalarioPendiente?: number
    periodosConsiderados?: number
  }
}

export function leerDetalleLiquidacion(d: unknown): DetalleLiquidacion | null {
  return d && typeof d === 'object' ? (d as DetalleLiquidacion) : null
}

export type FilaLiquidacion = { k: string; sub?: string; v: number }

export type CifrasLiquidacion = {
  diasLiquidados: number
  salarioBase: unknown
  cesantias: unknown
  interesesCesantias: unknown
  prima: unknown
  vacaciones: unknown
  indemnizacion: unknown
  deducciones: unknown
  total: unknown
}

export function filasLiquidacion(liq: CifrasLiquidacion, detalle: DetalleLiquidacion | null) {
  const n = (v: unknown) => Number(v ?? 0)
  // Las cesantías cuentan solo el año del retiro: los días totales del vínculo
  // no son los que se liquidan. Las liquidaciones viejas no los guardaron.
  const diasCes = detalle?.diasCesantias

  const ingresos: FilaLiquidacion[] = [
    { k: 'Salario', sub: detalle?.diasSalario ? `${detalle.diasSalario} días` : undefined, v: n(detalle?.salario) },
    { k: 'Auxilio de transporte', v: n(detalle?.auxilioTransporte) },
    { k: 'Otro concepto salarial', sub: 'comisiones y horas sin pagar', v: n(detalle?.otroConceptoSalarial) },
    { k: 'Cesantías', sub: diasCes ? `${diasCes} días` : undefined, v: n(liq.cesantias) },
    { k: 'Intereses cesantías', sub: diasCes ? `12% · ${diasCes} días` : '12%', v: n(liq.interesesCesantias) },
    { k: 'Prima salarial', sub: detalle?.diasPrima ? `${detalle.diasPrima} días` : undefined, v: n(liq.prima) },
    { k: 'Vacaciones compensadas', v: n(liq.vacaciones) },
    { k: 'Indemnización', v: n(liq.indemnizacion) },
  ].filter((f) => f.v > 0)

  const deducciones: FilaLiquidacion[] = [
    { k: 'Salud', sub: '4%', v: n(detalle?.salud) },
    { k: 'Fondo de pensión', sub: '4%', v: n(detalle?.pension) },
    { k: 'Saldo de préstamo', v: n(detalle?.saldoPrestamo) },
  ].filter((f) => f.v > 0)

  // Liquidaciones viejas no traen el desglose de deducciones; ahí manda la columna.
  const totalDeducciones = deducciones.length > 0 ? deducciones.reduce((t, f) => t + f.v, 0) : n(liq.deducciones)
  const totalIngresos = ingresos.reduce((t, f) => t + f.v, 0)

  return { ingresos, deducciones, totalIngresos, totalDeducciones, total: n(liq.total), dias: liq.diasLiquidados, salarioBase: n(liq.salarioBase) }
}

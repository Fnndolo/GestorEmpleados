import 'server-only'
import Decimal from 'decimal.js'

export type NominaReferencia = {
  id: string
  salarioBase: unknown
  diasTrabajados: unknown
  periodo: { nombre: string; fechaFin: Date; esAjuste: boolean; parametrosSnapshot: unknown }
  detalles: { conceptoCodigo: string; tipo: string; valor: unknown; base: unknown }[]
}

export type ReferenciaLiquidacion = {
  salarioBase: number | null
  auxilioTransporte: number | null
  nominaId: string | null
  periodoNombre: string | null
  fechaReferencia: string | null
}

/** Recupera valores mensuales, nunca el pago proporcional de una quincena. */
export function referenciaLiquidacion(nominas: NominaReferencia[], fechaRetiro: Date): ReferenciaLiquidacion {
  const ultima = nominas
    .filter((n) => !n.periodo.esAjuste && n.periodo.fechaFin <= fechaRetiro &&
      n.periodo.fechaFin.getUTCFullYear() === fechaRetiro.getUTCFullYear())
    .sort((a, b) => +b.periodo.fechaFin - +a.periodo.fechaFin)[0]

  if (!ultima) return { salarioBase: null, auxilioTransporte: null, nominaId: null, periodoNombre: null, fechaReferencia: null }

  const salario = Number(ultima.salarioBase)
  const auxilio = ultima.detalles.find((d) => d.tipo === 'DEVENGADO' && d.conceptoCodigo === 'AUX_TRANSPORTE')
  const dias = Number(ultima.diasTrabajados)
  let auxilioMensual: number | null = null
  if (!auxilio) {
    // Un periodo sin días trabajados no prueba que no tenga derecho al auxilio.
    if (dias > 0) auxilioMensual = 0
  } else {
    const snapshot = ultima.periodo.parametrosSnapshot
    const parametro = snapshot && typeof snapshot === 'object' && 'AUX_TRANSPORTE' in snapshot && snapshot.AUX_TRANSPORTE != null
      ? Number(snapshot.AUX_TRANSPORTE) : NaN
    const base = auxilio.base == null ? NaN : Number(auxilio.base)
    if (Number.isFinite(base) && base >= 0) auxilioMensual = base
    else if (Number.isFinite(parametro) && parametro >= 0) auxilioMensual = parametro
    // Sin base ni snapshot, solo un mes completo permite recuperar el valor
    // exacto. Deshacer el redondeo de una quincena puede inventar uno o más pesos.
    else if (dias === 30) auxilioMensual = new Decimal(String(auxilio.valor)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  }

  return {
    salarioBase: Number.isFinite(salario) && salario > 0 ? salario : null,
    auxilioTransporte: auxilioMensual,
    nominaId: ultima.id,
    periodoNombre: ultima.periodo.nombre,
    fechaReferencia: ultima.periodo.fechaFin.toISOString().slice(0, 10),
  }
}

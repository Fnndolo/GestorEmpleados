/** Formatea un valor en pesos colombianos: $1.750.905 */
export function fmtCOP(valor: number | null | undefined): string {
  if (valor == null) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

/** Formatea con decimales (para tarifas/porcentajes). */
export function fmtNumero(valor: number | null | undefined, decimales = 2): string {
  if (valor == null) return '0'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor)
}

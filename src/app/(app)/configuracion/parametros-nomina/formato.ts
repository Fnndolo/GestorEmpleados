const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

/**
 * Los parámetros mezclan pesos con porcentajes en la misma lista, y no hay un
 * campo que diga cuál es cuál: se distingue por magnitud. Valores ≤ 1 son
 * factores (0.04 → 4%), los grandes son pesos.
 */
export const fmtValor = (n: number) => (n > 100 ? fmtCOP(n) : n <= 1 ? `${Math.round(n * 10000) / 100}%` : String(n))

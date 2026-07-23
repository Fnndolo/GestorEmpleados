/**
 * Ordinales femeninos para títulos de cláusulas contractuales
 * ("PRIMERA. – OBJETO:", "DÉCIMA SEGUNDA - CLÁUSULA PENAL:", …) y utilidades
 * para renumerarlos cuando el usuario reordena, añade o elimina cláusulas.
 */

const UNIDADES = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA']
const DECENAS: Record<number, string> = { 10: 'DÉCIMA', 20: 'VIGÉSIMA', 30: 'TRIGÉSIMA' }

/** Ordinal femenino 1..39: 1 → "PRIMERA", 12 → "DÉCIMA SEGUNDA", 21 → "VIGÉSIMA PRIMERA". */
export function ordinalFemenino(n: number): string {
  if (n >= 1 && n <= 9) return UNIDADES[n - 1]
  const decena = Math.floor(n / 10) * 10
  const unidad = n % 10
  const base = DECENAS[decena]
  if (!base) return String(n) // fuera de rango: no inventar
  return unidad === 0 ? base : `${base} ${UNIDADES[unidad - 1]}`
}

// Detecta un ordinal al inicio del título, con su separador ('. – ', '. - ', ' - ', '.', …).
// Acepta también "SEPTIMA"/"DECIMA"/"VIGESIMA" sin tilde.
const ORDINAL_RE = new RegExp(
  '^\\s*(?:D[ÉE]CIMA|VIG[ÉE]SIMA|TRIG[ÉE]SIMA)?\\s*(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA)?\\s*[.]?\\s*[–—-]?\\s*',
)

/** ¿El título comienza con un ordinal reconocido? */
export function tieneOrdinal(titulo: string): boolean {
  const m = titulo.match(ORDINAL_RE)
  // El regex siempre matchea (todo es opcional); hay ordinal solo si capturó letras.
  return !!m && /[A-ZÁÉ]/.test(m[0])
}

/**
 * Reemplaza el ordinal inicial del título por el de la posición `n` (1-based),
 * normalizando el separador a ". – ". Si el título no tenía ordinal, se deja igual.
 */
export function renumerarTitulo(titulo: string, n: number): string {
  if (!tieneOrdinal(titulo)) return titulo
  const resto = titulo.replace(ORDINAL_RE, '').trim()
  return `${ordinalFemenino(n)}. – ${resto}`
}

/** Normaliza texto para búsqueda: minúsculas y sin tildes/diacríticos. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// Conversión de números y fechas a letras (español, Colombia). Sin dependencias.

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const DIEZ_A_QUINCE = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

function decenas(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n <= 15) return DIEZ_A_QUINCE[n - 10]
  // Las que llevan tilde: dieciséis, veintidós, veintitrés, veintiséis.
  if (n === 16) return 'DIECISÉIS'
  if (n < 20) return 'DIECI' + UNIDADES[n - 10]
  if (n === 22) return 'VEINTIDÓS'
  if (n === 23) return 'VEINTITRÉS'
  if (n === 26) return 'VEINTISÉIS'
  if (n < 30) return n === 20 ? 'VEINTE' : 'VEINTI' + UNIDADES[n - 20]
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`
}

function centenas(n: number): string {
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const pre = CENTENAS[c]
  return resto === 0 ? pre : `${pre} ${decenas(resto)}`.trim()
}

/** «Uno» delante de un sustantivo: «veintiún mil», «treinta y un millones». */
function apocopar(letras: string): string {
  return letras.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN')
}

function seccion(n: number, singular: string, plural: string): string {
  if (n === 0) return ''
  if (n === 1) return singular
  return `${apocopar(numeroALetras(n))} ${plural}`
}

/** Convierte un entero no negativo a palabras en español (mayúsculas). */
export function numeroALetras(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'CERO'
  if (n < 100) return decenas(n)
  if (n < 1000) return centenas(n)
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000)
    const resto = n % 1000
    const pre = miles === 1 ? 'MIL' : `${apocopar(numeroALetras(miles))} MIL`
    return resto === 0 ? pre : `${pre} ${centenas(resto)}`
  }
  if (n < 1_000_000_000) {
    const millones = Math.floor(n / 1_000_000)
    const resto = n % 1_000_000
    const pre = seccion(millones, 'UN MILLÓN', 'MILLONES')
    return resto === 0 ? pre : `${pre} ${numeroALetras(resto)}`
  }
  const miles = Math.floor(n / 1_000_000_000)
  const resto = n % 1_000_000_000
  const pre = `${apocopar(numeroALetras(miles))} MIL MILLONES`
  return resto === 0 ? pre : `${pre} ${numeroALetras(resto)}`
}

/** Valor en pesos: "UN MILLÓN QUINIENTOS MIL PESOS M/CTE ($1.500.000)". */
export function pesosALetras(valor: number): string {
  const entero = Math.round(valor)
  // Ante «pesos», «uno» se apocopa: «un peso», «veintiún pesos».
  const letras = apocopar(numeroALetras(entero))
  const formato = entero.toLocaleString('es-CO')
  const moneda = entero === 1 ? 'PESO' : 'PESOS'
  // Millones exactos llevan «de»: «un millón de pesos», «dos millones de pesos».
  const de = /MILL(ÓN|ONES)$/.test(letras) ? ' DE' : ''
  return `${letras}${de} ${moneda} M/CTE ($${formato})`
}

/** Fecha larga: "10 de julio de 2026" (usa componentes locales, sin corrimiento UTC). */
export function fechaLarga(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? parseFechaLocal(fecha) : fecha
  return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`
}

/** Fecha en letras y dígitos: "DIEZ (10) DE JULIO DE 2026". */
export function fechaLargaLetras(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? parseFechaLocal(fecha) : fecha
  return `${numeroALetras(d.getDate())} (${d.getDate()}) DE ${MESES[d.getMonth()]} DE ${d.getFullYear()}`
}

/** Fecha corta dd/mm/aaaa. */
export function fechaCorta(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? parseFechaLocal(fecha) : fecha
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** Plazo en meses: "TRES (03) MESES". */
export function mesesALetras(meses: number): string {
  const m = Math.max(0, Math.floor(meses))
  const unidad = m === 1 ? 'MES' : 'MESES'
  return `${numeroALetras(m)} (${String(m).padStart(2, '0')}) ${unidad}`
}

/** Parsea 'YYYY-MM-DD' como fecha local (evita el corrimiento de zona horaria). */
function parseFechaLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

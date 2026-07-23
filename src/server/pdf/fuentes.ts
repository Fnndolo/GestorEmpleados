import { Font } from '@react-pdf/renderer'
import { BOOKMAN_REGULAR, BOOKMAN_BOLD, BOOKMAN_ITALIC } from './assets/bookman'

/**
 * Registra la fuente Bookman Old Style (normal/negrita/cursiva) para los PDF con
 * membrete de KUPOCELL (autorización de datos y contrato OPS). Idempotente: llamar
 * antes de renderizar. No afecta a los demás PDF, que siguen en Helvetica.
 */
let registrada = false
export function registrarBookman() {
  if (registrada) return
  Font.register({
    family: 'Bookman Old Style',
    fonts: [
      { src: BOOKMAN_REGULAR, fontWeight: 'normal' },
      { src: BOOKMAN_BOLD, fontWeight: 'bold' },
      { src: BOOKMAN_ITALIC, fontStyle: 'italic' },
    ],
  })
  // Evita cortes de palabra automáticos poco naturales en español.
  Font.registerHyphenationCallback((word) => [word])
  registrada = true
}

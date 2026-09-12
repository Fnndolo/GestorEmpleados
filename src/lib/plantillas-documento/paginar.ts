/**
 * Paginación de una vista previa por bloques medidos, imitando lo que hace el
 * PDF (react-pdf): un párrafo se puede partir entre páginas por líneas completas,
 * respetando un mínimo de dos líneas a cada lado (huérfanas/viudas); un bloque
 * no divisible (el de la firma, `wrap={false}` en el PDF) pasa entero a la
 * página siguiente si no cabe.
 */

export type BloqueMedido = {
  /** Alto del bloque sin márgenes (pt). */
  alto: number
  margenArriba: number
  margenAbajo: number
  /** Alto de una línea (pt): la unidad para partir un bloque divisible. */
  interlineado: number
  /** ¿Puede partirse entre páginas? */
  divisible: boolean
}

/** Porción de un bloque que va en una página. */
export type Trozo = {
  bloque: number
  /** Cuántos pt del bloque ya se mostraron en páginas anteriores. */
  desde: number
  /** Alto visible en esta página (pt). */
  alto: number
  /** ¿Es el comienzo del bloque? (lleva su margen superior) */
  inicio: boolean
  /** ¿Es el final del bloque? (lleva su margen inferior) */
  fin: boolean
}

const EPS = 0.5
const MINIMO_LINEAS = 2

export function paginar(bloques: BloqueMedido[], disponible: number): Trozo[][] {
  const paginas: Trozo[][] = [[]]
  let y = 0

  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i]
    let desde = 0
    for (;;) {
      const pagina = paginas[paginas.length - 1]
      const arriba = desde === 0 ? b.margenArriba : 0
      const restante = disponible - y - arriba
      const falta = b.alto - desde

      // Cabe completo
      if (falta <= restante + EPS) {
        pagina.push({ bloque: i, desde, alto: falta, inicio: desde === 0, fin: true })
        y += arriba + falta + b.margenAbajo
        break
      }

      // Se parte por líneas completas si quedan al menos dos aquí y dos para la siguiente
      if (b.divisible && b.interlineado > 0) {
        const caben = Math.floor((restante + EPS) / b.interlineado)
        const totales = Math.round(falta / b.interlineado)
        if (caben >= MINIMO_LINEAS && totales - caben >= MINIMO_LINEAS) {
          const alto = caben * b.interlineado
          pagina.push({ bloque: i, desde, alto, inicio: desde === 0, fin: false })
          desde += alto
          paginas.push([])
          y = 0
          continue
        }
      }

      // No cabe ni en una página vacía: se deja desbordar, como haría el PDF
      if (pagina.length === 0) {
        pagina.push({ bloque: i, desde, alto: falta, inicio: desde === 0, fin: true })
        y = disponible
        break
      }

      // Página nueva y se vuelve a intentar
      paginas.push([])
      y = 0
    }
  }
  return paginas
}

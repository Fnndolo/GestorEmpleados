/**
 * Limpia una imagen de firma subida por el usuario para que se estampe bien
 * sobre un PDF: si ya viene con fondo transparente se respeta; si viene sobre
 * papel (foto o escaneo, fondo blanco o grisáceo, incluso con sombra) se le
 * quita el fondo dejando solo el trazo, y se recorta al trazo para que no
 * llegue con márgenes vacíos que la empequeñecen en el documento.
 *
 * Todo ocurre en el navegador con un canvas; no se sube nada a un servicio.
 */

export type FirmaLimpia = { dataUri: string; fondoQuitado: boolean }

const ANCHO_MAX = 1200
/** Por debajo de esta fracción de píxeles translúcidos, la imagen no trae transparencia real. */
const MINIMO_TRANSPARENTE = 0.01
/** Qué tan más oscuro que su entorno tiene que ser un píxel para contar como trazo. */
const CONTRASTE_MIN = 0.08
const CONTRASTE_PLENO = 0.35

function cargar(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = dataUri
  })
}

/**
 * Promedio local de luminancia con una tabla de sumas acumuladas: O(1) por
 * píxel sea cual sea el radio. Es el "papel" que hay detrás de cada punto, y
 * sirve para que una sombra o una foto mal iluminada no se queden como fondo.
 */
function fondoLocal(lum: Float32Array, w: number, h: number, radio: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1))
  for (let y = 1; y <= h; y++) {
    let fila = 0
    for (let x = 1; x <= w; x++) {
      fila += lum[(y - 1) * w + (x - 1)]
      sat[y * (w + 1) + x] = sat[(y - 1) * (w + 1) + x] + fila
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio), y1 = Math.min(h, y + radio + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio), x1 = Math.min(w, x + radio + 1)
      const suma = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0]
      out[y * w + x] = suma / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

export async function limpiarFondoFirma(dataUri: string): Promise<FirmaLimpia> {
  const img = await cargar(dataUri)
  const escala = Math.min(1, ANCHO_MAX / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * escala))
  const h = Math.max(1, Math.round(img.naturalHeight * escala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { dataUri, fondoQuitado: false }
  ctx.drawImage(img, 0, 0, w, h)
  const imagen = ctx.getImageData(0, 0, w, h)
  const px = imagen.data

  // 1) Si ya trae transparencia de verdad (un PNG con fondo quitado), no se toca.
  let translucidos = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) translucidos++
  if (translucidos / (w * h) >= MINIMO_TRANSPARENTE) return { dataUri, fondoQuitado: false }

  // 2) Luminancia y fondo local.
  const lum = new Float32Array(w * h)
  for (let i = 0, p = 0; i < px.length; i += 4, p++) lum[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  const fondo = fondoLocal(lum, w, h, Math.max(8, Math.round(Math.max(w, h) / 12)))

  // 3) Cuanto más oscuro que su papel, más opaco; el papel queda transparente.
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const contraste = 1 - lum[p] / Math.max(fondo[p], 1)
    const a = Math.min(1, Math.max(0, (contraste - CONTRASTE_MIN) / (CONTRASTE_PLENO - CONTRASTE_MIN)))
    px[i + 3] = Math.round(a * 255)
    if (a > 0) {
      const x = p % w, y = (p - x) / w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { dataUri, fondoQuitado: false } // no se encontró trazo: mejor dejar la imagen tal cual
  ctx.putImageData(imagen, 0, 0)

  // 4) Recorte al trazo con un margen pequeño.
  const margen = Math.round(Math.max(w, h) * 0.03)
  const x0 = Math.max(0, minX - margen), y0 = Math.max(0, minY - margen)
  const x1 = Math.min(w, maxX + margen + 1), y1 = Math.min(h, maxY + margen + 1)
  const salida = document.createElement('canvas')
  salida.width = x1 - x0
  salida.height = y1 - y0
  salida.getContext('2d')!.drawImage(canvas, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height)
  return { dataUri: salida.toDataURL('image/png'), fondoQuitado: true }
}

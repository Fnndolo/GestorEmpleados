/**
 * Achica una foto antes de subirla. En producción el servidor no admite cuerpos
 * de más de ~4,5 MB, y una foto de celular pesa de 3 a 8 MB: sin esto, el
 * comprobante de un permiso o el soporte de una incapacidad no llegaban nunca.
 *
 * Solo toca imágenes pesadas; los PDF y las fotos livianas pasan tal cual. Si el
 * navegador no puede leer la imagen (HEIC en algunos Android), la deja igual.
 */
const LADO_MAX = 1800
const UMBRAL_BYTES = 1.5 * 1024 * 1024

export async function reducirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/gif' || archivo.size <= UMBRAL_BYTES) return archivo
  try {
    const bitmap = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob || blob.size >= archivo.size) return archivo
    const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: archivo.lastModified })
  } catch {
    return archivo
  }
}

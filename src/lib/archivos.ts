/**
 * Cómo viajan los archivos del navegador al servidor.
 *
 * Dos vías, según el peso:
 *  - `leerComoDataUri`: el archivo como texto base64 dentro de la Server Action.
 *    Sirve para lo pequeño (firmas, fotos ya comprimidas): el cuerpo de una
 *    acción tiene tope de 4 MB y base64 infla el archivo un tercio.
 *  - `subirPdfTemporal`: el PDF se sube aparte, por partes, a un depósito
 *    temporal (`/api/archivos/pdf`) y la acción recibe solo una referencia
 *    firmada (`pdfRef`). Es la vía de los contratos, otrosíes, acuerdos y
 *    documentos adjuntos: admite hasta `MAX_PDF_BYTES` y la acción sigue
 *    siendo una sola operación (lee el PDF del depósito, hace lo suyo y lo
 *    retira).
 */

/** Tope de un PDF subido por el depósito temporal. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

export function mensajePdfPesado(bytes: number): string {
  return `El PDF pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB. Escanéalo en escala de grises a 150–200 dpi, o comprímelo, y vuelve a intentarlo.`
}

export function leerComoDataUri(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(archivo)
  })
}

/**
 * Sube un PDF al depósito temporal y devuelve la referencia que la Server
 * Action recibe como `pdfRef`. Valida el peso antes de mandar nada; el
 * servidor vuelve a validar. Lanza con un mensaje listo para mostrar.
 */
export async function subirPdfTemporal(archivo: File): Promise<string> {
  if (archivo.size > MAX_PDF_BYTES) throw new Error(mensajePdfPesado(archivo.size))
  const fd = new FormData()
  fd.append('archivo', archivo)
  const res = await fetch('/api/archivos/pdf', { method: 'POST', body: fd })
  const datos = (await res.json().catch(() => null)) as { ref?: string; error?: string } | null
  if (!res.ok || !datos?.ref) throw new Error(datos?.error ?? 'No se pudo subir el PDF. Revisa la conexión e inténtalo de nuevo.')
  return datos.ref
}

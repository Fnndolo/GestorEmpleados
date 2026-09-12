/**
 * Lee un archivo del navegador como data URI (`data:<tipo>;base64,…`).
 *
 * Es como viajan los PDF y las firmas hacia las Server Actions: un texto que
 * cabe en el cuerpo de la petición, sin montar subida por partes. Ojo con el
 * tamaño: base64 infla el archivo un tercio y el límite del cuerpo es 4 MB.
 */
export function leerComoDataUri(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(archivo)
  })
}

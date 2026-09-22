/**
 * Cómo viajan los archivos del navegador al servidor.
 *
 * Dos vías, según el peso:
 *  - `leerComoDataUri`: el archivo como texto base64 dentro de la Server Action.
 *    Sirve para lo pequeño (firmas, fotos ya comprimidas): el cuerpo de una
 *    acción tiene tope de 4 MB y base64 infla el archivo un tercio.
 *  - `subirArchivoTemporal` (y su atajo `subirPdfTemporal`): el archivo se sube
 *    aparte a un depósito temporal y la acción recibe solo una referencia
 *    firmada (`pdfRef`). Es la vía de los contratos, otrosíes, acuerdos y
 *    documentos adjuntos: admite hasta `MAX_PDF_BYTES` y la acción sigue
 *    siendo una sola operación (lee el archivo del depósito, hace lo suyo y lo
 *    retira).
 *
 * El archivo viaja del navegador DIRECTO al almacenamiento con una URL
 * firmada. No es un capricho: en producción el servidor no admite cuerpos de
 * más de ~4,5 MB, así que un escaneo grande nunca llegaría si pasara por él.
 * Cuando no hay subida directa (desarrollo, o un fallo al firmarla) se cae a
 * mandárselo al servidor, que es lo que se hacía antes.
 */

/** Tope de un archivo subido por el depósito temporal. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024

/**
 * Qué se puede subir, según para qué es el archivo.
 *
 * `firma`: solo PDF. Son los documentos que la app tiene que ABRIR —el contrato
 * que se manda a firmar, el otrosí, el acuerdo—: los lee para proponer dónde
 * firma cada parte y les estampa la firma encima.
 *
 * `evidencia`: además, comprimidos. Son los que solo se archivan —el contrato
 * ya firmado en físico que se sube desde la ficha, su autorización de datos—:
 * ahí el archivo es la prueba, nadie lo vuelve a firmar dentro de la app, y un
 * escaneo suele venir repartido en varios archivos dentro de un ZIP.
 */
export const TIPOS_FIRMA = ['application/pdf'] as const
export const TIPOS_EVIDENCIA = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
] as const

/** Lo que se le pone al `accept` del selector de archivos. */
export const ACEPTA_FIRMA = 'application/pdf,.pdf'
export const ACEPTA_EVIDENCIA = 'application/pdf,.pdf,.zip,.rar,.7z'

export type ModoArchivo = 'firma' | 'evidencia'

export function tiposDe(modo: ModoArchivo): readonly string[] {
  return modo === 'evidencia' ? TIPOS_EVIDENCIA : TIPOS_FIRMA
}

/** Extensión → tipo, para cuando el navegador no lo reconoce (.rar suele venir vacío). */
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
}

/** El tipo del archivo, corrigiendo lo que el navegador no supo decir. */
export function tipoDeArchivo(archivo: { name: string; type?: string }): string {
  const ext = archivo.name.includes('.') ? archivo.name.split('.').pop()!.toLowerCase() : ''
  return TIPO_POR_EXTENSION[ext] ?? archivo.type ?? ''
}

export function esComprimido(mimeType: string): boolean {
  return mimeType !== 'application/pdf' && (TIPOS_EVIDENCIA as readonly string[]).includes(mimeType)
}

export function mensajePdfPesado(bytes: number): string {
  return `El archivo pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo son 25 MB. Escanéalo en escala de grises a 150–200 dpi y vuelve a intentarlo.`
}

export function mensajeTipoNoAdmitido(modo: ModoArchivo): string {
  return modo === 'evidencia'
    ? 'El archivo debe ser un PDF o un comprimido (ZIP, RAR o 7z).'
    : 'El archivo debe ser un PDF: la app tiene que abrirlo para firmarlo.'
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
 * Sube un archivo al depósito temporal y devuelve la referencia que la Server
 * Action recibe como `pdfRef`. Valida tipo y peso antes de mandar nada; el
 * servidor vuelve a validar al leerlo. Lanza con un mensaje listo para mostrar.
 */
export async function subirArchivoTemporal(archivo: File, modo: ModoArchivo = 'firma'): Promise<string> {
  if (archivo.size > MAX_PDF_BYTES) throw new Error(mensajePdfPesado(archivo.size))
  const mimeType = tipoDeArchivo(archivo)
  if (!tiposDe(modo).includes(mimeType)) throw new Error(mensajeTipoNoAdmitido(modo))

  // Primero se pregunta cómo subirlo; el servidor dice si hay subida directa.
  const previo = await fetch('/api/archivos/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytes: archivo.size, nombre: archivo.name, mimeType, modo }),
  })
  const plan = (await previo.json().catch(() => null)) as { modo?: string; url?: string; ref?: string; error?: string } | null
  if (!previo.ok) throw new Error(plan?.error ?? 'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.')

  if (plan?.modo === 'directo' && plan.url && plan.ref) {
    // Mismo PUT que hace el SDK de Supabase con un cuerpo binario: la URL ya
    // lleva el permiso firmado, así que solo va el tipo de contenido.
    const subida = await fetch(plan.url, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: archivo,
    }).catch(() => null)
    if (subida?.ok) return plan.ref
    // Si la subida directa falla, se intenta por el servidor: con un archivo
    // pequeño funciona igual, y con uno grande el mensaje lo dirá.
    console.error('Subida directa fallida:', subida?.status, await subida?.text().catch(() => ''))
  }

  const fd = new FormData()
  fd.append('archivo', archivo)
  fd.append('modo', modo)
  const res = await fetch('/api/archivos/pdf', { method: 'POST', body: fd })
  const datos = (await res.json().catch(() => null)) as { ref?: string; error?: string } | null
  if (!res.ok || !datos?.ref) {
    throw new Error(
      datos?.error ??
        (res.status === 413
          ? `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y no se pudo subir. Escanéalo más liviano (escala de grises, 150–200 dpi) e inténtalo de nuevo.`
          : 'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.'),
    )
  }
  return datos.ref
}

/** Atajo para los documentos que la app tiene que abrir y firmar: solo PDF. */
export function subirPdfTemporal(archivo: File): Promise<string> {
  return subirArchivoTemporal(archivo, 'firma')
}

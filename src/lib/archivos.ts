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
 * En local se envían partes pequeñas al servidor. En Supabase se usa TUS,
 * con reintentos sin volver a enviar todo el documento.
 */

/** Capacidad del campo Documento.tamanoBytes (PostgreSQL int4). */
export const MAX_PDF_BYTES = 2 ** 31 - 1
/** Cada petición al servidor queda por debajo del límite de la plataforma. */
export const PARTE_ARCHIVO_BYTES = 3 * 1024 * 1024

export type SubidaReanudable = { endpoint: string; token: string; bucket: string; objectName: string }

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
  return `El archivo pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y supera la capacidad de registro de documentos (2 GB).`
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
export async function subirArchivoTemporal(
  archivo: File,
  modo: ModoArchivo = 'firma',
  progreso?: (porcentaje: number) => void,
): Promise<string> {
  if (!archivo.size) throw new Error('El archivo está vacío.')
  if (archivo.size > MAX_PDF_BYTES) throw new Error(mensajePdfPesado(archivo.size))
  const mimeType = tipoDeArchivo(archivo)
  if (!tiposDe(modo).includes(mimeType)) throw new Error(mensajeTipoNoAdmitido(modo))

  // Primero se pregunta cómo subirlo; el servidor dice si hay subida directa.
  const previo = await fetch('/api/archivos/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bytes: archivo.size, nombre: archivo.name, mimeType, modo }),
  })
  const plan = (await previo.json().catch(() => null)) as {
    modo?: string; reanudable?: SubidaReanudable; ref?: string; error?: string
  } | null
  if (!previo.ok) throw new Error(plan?.error ?? 'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.')

  if (plan?.modo === 'directo' && plan.reanudable && plan.ref) {
    const { subirReanudable } = await import('./subida-reanudable')
    try {
      await subirReanudable(archivo, mimeType, plan.reanudable, progreso)
      return plan.ref
    } catch (e) {
      // Si el navegador suspendió la red a mitad de la subida (equipo en reposo,
      // pestaña en segundo plano), al volver el permiso firmado ya no sirve y el
      // almacenamiento responde 400. Se pide un permiso nuevo y se intenta una vez
      // más desde cero. El tamaño excesivo (413) no se arregla reintentando.
      if ((e as { status?: number }).status === 413) throw e
      const otra = await fetch('/api/archivos/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytes: archivo.size, nombre: archivo.name, mimeType, modo }),
      }).catch(() => null)
      const plan2 = (await otra?.json().catch(() => null)) as { modo?: string; reanudable?: SubidaReanudable; ref?: string } | null
      if (!otra?.ok || plan2?.modo !== 'directo' || !plan2.reanudable || !plan2.ref) throw e
      await subirReanudable(archivo, mimeType, plan2.reanudable, progreso)
      return plan2.ref
    }
  }
  if (plan?.modo !== 'partes' || !plan.ref) throw new Error('No se pudo preparar la subida del archivo.')

  let offset = 0
  while (offset < archivo.size) {
    const parte = archivo.slice(offset, offset + PARTE_ARCHIVO_BYTES)
    let siguiente: number | undefined
    // Si se perdió la respuesta, el servidor devuelve el desplazamiento ya
    // guardado. Nunca concatena otra vez una parte repetida.
    for (let intento = 0; intento < 3; intento++) {
      const res = await fetch('/api/archivos/pdf', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Archivo-Ref': plan.ref, 'X-Archivo-Offset': String(offset) },
        body: parte,
      }).catch(() => null)
      const datos = await res?.json().catch(() => null) as { bytes?: number; error?: string } | null | undefined
      const bytes = datos?.bytes
      if (res?.ok && typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes > offset && bytes <= archivo.size) {
        siguiente = bytes
        break
      }
      if (res && res.status < 500 && res.status !== 409) throw new Error(datos?.error ?? 'No se pudo subir el archivo.')
      if (intento === 2) throw new Error(datos?.error ?? 'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.')
      await new Promise((resolve) => setTimeout(resolve, 500 * (intento + 1)))
    }
    if (siguiente == null) throw new Error('No se pudo completar la subida del archivo.')
    offset = siguiente
    progreso?.(Math.round(offset / archivo.size * 100))
  }
  return plan.ref
}

/** Atajo para los documentos que la app tiene que abrir y firmar: solo PDF. */
export function subirPdfTemporal(archivo: File, progreso?: (porcentaje: number) => void): Promise<string> {
  return subirArchivoTemporal(archivo, 'firma', progreso)
}

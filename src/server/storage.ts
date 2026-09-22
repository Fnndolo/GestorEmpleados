import 'server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'

/**
 * Almacenamiento de documentos con driver intercambiable:
 *  - STORAGE_DRIVER=local    → guarda en ./uploads (desarrollo)
 *  - STORAGE_DRIVER=supabase → Supabase Storage (bucket privado, URLs firmadas)
 *
 * Toda lectura pasa por el servidor y emite URLs firmadas de corta duración;
 * los datos sensibles nunca se exponen públicamente (Ley 1581, R17).
 */

const DRIVER = process.env.STORAGE_DRIVER ?? 'local'
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos'
const DIR_LOCAL = join(process.cwd(), 'uploads')

export type ArchivoSubido = {
  storagePath: string
  bucket: string
  mimeType: string
  tamanoBytes: number
}

function clienteSupabase() {
  // Import dinámico para no cargar el SDK cuando se usa el driver local
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga diferida a propósito
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function rutaSegura(prefijo: string, nombreOriginal: string): string {
  const ext = nombreOriginal.includes('.') ? '.' + nombreOriginal.split('.').pop() : ''
  return `${prefijo}/${randomUUID()}${ext}`
}

export async function subirArchivo(
  prefijo: string,
  nombreOriginal: string,
  contenido: Buffer,
  mimeType: string,
): Promise<ArchivoSubido> {
  const storagePath = rutaSegura(prefijo, nombreOriginal)

  if (DRIVER === 'supabase') {
    const supabase = clienteSupabase()
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, contenido, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) throw new Error(`Supabase Storage: ${error.message}`)
  } else {
    const destino = join(DIR_LOCAL, storagePath)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, contenido)
  }

  return { storagePath, bucket: BUCKET, mimeType, tamanoBytes: contenido.byteLength }
}

/** Sube a una ruta exacta (p. ej. la miniatura junto a su foto), pisando lo que haya. */
export async function subirArchivoEn(storagePath: string, contenido: Buffer, mimeType: string): Promise<void> {
  if (DRIVER === 'supabase') {
    const supabase = clienteSupabase()
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, contenido, { contentType: mimeType, upsert: true })
    if (error) throw new Error(`Supabase Storage: ${error.message}`)
  } else {
    const destino = join(DIR_LOCAL, storagePath)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, contenido)
  }
}

/** Devuelve el contenido del archivo (para servirlo desde un Route Handler protegido). */
export async function leerArchivo(storagePath: string): Promise<Buffer> {
  if (DRIVER === 'supabase') {
    const supabase = clienteSupabase()
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? 'no encontrado'}`)
    return Buffer.from(await data.arrayBuffer())
  }
  return readFile(join(DIR_LOCAL, storagePath))
}

export async function eliminarArchivo(storagePath: string): Promise<void> {
  if (DRIVER === 'supabase') {
    const supabase = clienteSupabase()
    await supabase.storage.from(BUCKET).remove([storagePath])
  } else {
    await unlink(join(DIR_LOCAL, storagePath)).catch(() => {})
  }
}

/**
 * URL firmada para que el NAVEGADOR suba un archivo directo al almacenamiento,
 * sin pasar por el servidor.
 *
 * Es la única forma de aceptar archivos grandes en producción: la plataforma
 * corta el cuerpo de cualquier petición al servidor en ~4,5 MB, así que un
 * escaneo de 10 MB nunca llegaría. Con esta URL el archivo va del navegador a
 * Supabase y el servidor solo recibe la ruta.
 *
 * Devuelve null con el driver local (en desarrollo no hay límite que esquivar)
 * o si Supabase no la pudo emitir: quien llama cae a la subida normal.
 */
export async function urlSubidaFirmada(storagePath: string): Promise<string | null> {
  if (DRIVER !== 'supabase') return null
  try {
    const supabase = clienteSupabase()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
    if (error || !data?.signedUrl) {
      console.error('No se pudo firmar la subida directa:', error?.message)
      return null
    }
    return data.signedUrl
  } catch (e) {
    console.error('No se pudo firmar la subida directa:', e)
    return null
  }
}

/**
 * Tamaño del archivo SIN descargarlo. Con Supabase se pregunta por los
 * metadatos del objeto; en local, al sistema de archivos. Devuelve null si no
 * existe o no se pudo saber.
 *
 * Sirve para cortar un archivo demasiado grande antes de traerlo a memoria:
 * lo que se sube directo al almacenamiento no pasó por el servidor, así que su
 * tamaño real solo se conoce aquí.
 */
export async function tamanoArchivo(storagePath: string): Promise<number | null> {
  if (DRIVER === 'supabase') {
    try {
      const supabase = clienteSupabase()
      const carpeta = storagePath.includes('/') ? storagePath.slice(0, storagePath.lastIndexOf('/')) : ''
      const nombre = storagePath.slice(storagePath.lastIndexOf('/') + 1)
      const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, { search: nombre, limit: 1 })
      if (error || !data?.length) return null
      const tam = (data[0].metadata as { size?: number } | null)?.size
      return typeof tam === 'number' ? tam : null
    } catch {
      return null
    }
  }
  try {
    const { stat } = await import('node:fs/promises')
    return (await stat(join(DIR_LOCAL, storagePath))).size
  } catch {
    return null
  }
}

/** Archivos de una carpeta del almacenamiento creados antes de `antesDe`, con su ruta completa. */
export async function archivosAntiguos(prefijo: string, antesDe: Date): Promise<string[]> {
  if (DRIVER === 'supabase') {
    const supabase = clienteSupabase()
    const viejos: string[] = []
    // El depósito guarda `temporal/<usuario>/<archivo>`: se recorre carpeta por carpeta.
    const { data: carpetas } = await supabase.storage.from(BUCKET).list(prefijo, { limit: 1000 })
    for (const carpeta of carpetas ?? []) {
      const { data: archivos } = await supabase.storage.from(BUCKET).list(`${prefijo}/${carpeta.name}`, { limit: 1000 })
      for (const a of archivos ?? []) {
        const creado = a.created_at ? new Date(a.created_at) : null
        if (creado && creado < antesDe) viejos.push(`${prefijo}/${carpeta.name}/${a.name}`)
      }
    }
    return viejos
  }
  try {
    const { readdir, stat } = await import('node:fs/promises')
    const raiz = join(DIR_LOCAL, prefijo)
    const viejos: string[] = []
    for (const carpeta of await readdir(raiz)) {
      for (const nombre of await readdir(join(raiz, carpeta))) {
        const ruta = `${prefijo}/${carpeta}/${nombre}`
        const s = await stat(join(DIR_LOCAL, ruta))
        if (s.mtime < antesDe) viejos.push(ruta)
      }
    }
    return viejos
  } catch {
    return []
  }
}

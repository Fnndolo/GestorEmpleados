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

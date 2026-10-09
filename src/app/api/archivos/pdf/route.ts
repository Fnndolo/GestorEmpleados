import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { ErrorNegocio } from '@/server/accion'
import { guardarArchivoTemporal, guardarParteTemporal, prepararSubidaDirecta, prepararSubidaLocal } from '@/server/archivos-temporales'
import { PARTE_ARCHIVO_BYTES, tipoDeArchivo, type ModoArchivo } from '@/lib/archivos'
import { ErrorParteEnCurso } from '@/server/subida-local'

export const runtime = 'nodejs'

const modoDe = (v: unknown): ModoArchivo => (v === 'evidencia' ? 'evidencia' : 'firma')

class ErrorCuerpoGrande extends ErrorNegocio {}

async function leerCuerpoLimitado(req: NextRequest, limite: number): Promise<Buffer> {
  if (Number(req.headers.get('content-length')) > limite) throw new ErrorCuerpoGrande('Utiliza la subida por partes para este archivo.')
  if (!req.body) return Buffer.alloc(0)
  const reader = req.body.getReader()
  const partes: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limite) {
        await reader.cancel()
        throw new ErrorCuerpoGrande('La parte del archivo es demasiado grande.')
      }
      partes.push(Buffer.from(value))
    }
    return Buffer.concat(partes)
  } finally { reader.releaseLock() }
}

/**
 * Depósito temporal de archivos (ver `src/server/archivos-temporales.ts`). Dos
 * modos, y el navegador pregunta primero cuál toca:
 *
 *  - JSON `{ bytes, nombre, mimeType, modo }` → si el almacenamiento puede
 *    firmar una subida, devuelve `{ modo: 'directo', reanudable, ref }`: el archivo va
 *    del navegador a Supabase sin pasar por aquí. Es lo único que funciona con
 *    archivos grandes en producción, donde el cuerpo de una petición al
 *    servidor se corta en ~4,5 MB.
 *  - En local devuelve `{ modo: 'partes', ref }` y recibe partes por PATCH.
 *  - multipart pequeño se conserva para compatibilidad.
 *
 * `modo` dice qué se admite: `firma` solo PDF (la app tiene que abrirlo para
 * firmarlo), `evidencia` también comprimidos (solo se archiva). Basta con estar
 * dentro de la app: el permiso de verdad lo exige la acción que use la
 * referencia, y la referencia solo le sirve a quien la pidió.
 */
export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  // No basta con tener sesión: una cuenta inactiva o que todavía debe cambiar la
  // contraseña no puede escribir en el almacenamiento (lo mismo que exige
  // `requerirSesion` en las pantallas).
  if (!usuario || usuario.estado !== 'ACTIVO' || usuario.debeCambiarPassword) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const { bytes, nombre, mimeType, modo } = JSON.parse((await leerCuerpoLimitado(req, 16 * 1024)).toString('utf8')) as {
        bytes?: number; nombre?: string; mimeType?: string; modo?: string
      }
      const opts = {
        mimeType: mimeType || 'application/pdf',
        nombre: typeof nombre === 'string' ? nombre : undefined,
        modo: modoDe(modo),
      }
      const directa = await prepararSubidaDirecta(usuario.id, Number(bytes) || 0, opts)
      return NextResponse.json(directa
        ? { modo: 'directo', ...directa }
        : { modo: 'partes', ...await prepararSubidaLocal(usuario.id, Number(bytes) || 0, opts) })
    }

    // Se corta por el tamaño anunciado antes de leer el cuerpo completo.
    const anunciado = Number(req.headers.get('content-length') ?? 0)
    if (anunciado > PARTE_ARCHIVO_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'Utiliza la subida por partes para este archivo.' }, { status: 413 })
    }
    const cuerpo = await leerCuerpoLimitado(req, PARTE_ARCHIVO_BYTES + 64 * 1024)
    const form = await new Response(new Uint8Array(cuerpo), { headers: { 'Content-Type': req.headers.get('content-type') ?? '' } }).formData()
    const archivo = form.get('archivo')
    if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
    if (archivo.size > PARTE_ARCHIVO_BYTES) return NextResponse.json({ error: 'Utiliza la subida por partes para este archivo.' }, { status: 413 })

    const r = await guardarArchivoTemporal(Buffer.from(await archivo.arrayBuffer()), usuario.id, {
      mimeType: tipoDeArchivo(archivo),
      nombre: archivo.name,
      modo: modoDe(form.get('modo')),
    })
    return NextResponse.json({ modo: 'multipart', ref: r.ref, bytes: r.bytes, nombre: archivo.name })
  } catch (e) {
    if (e instanceof ErrorNegocio) return NextResponse.json({ error: e.message }, { status: e instanceof ErrorCuerpoGrande ? 413 : 400 })
    console.error('No se pudo preparar el archivo temporal:', e)
    return NextResponse.json({ error: 'No se pudo subir el archivo. Inténtalo de nuevo.' }, { status: 500 })
  }
}

/** Las partes locales nunca superan 3 MB, incluso sin Content-Length. */
export async function PATCH(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario || usuario.estado !== 'ACTIVO' || usuario.debeCambiarPassword) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const ref = req.headers.get('x-archivo-ref')
  const offset = req.headers.get('x-archivo-offset')
  if (!ref || offset == null || !/^\d+$/.test(offset) || !req.body) return NextResponse.json({ error: 'Faltan los datos de la subida.' }, { status: 400 })
  if (Number(req.headers.get('content-length')) > PARTE_ARCHIVO_BYTES) {
    return NextResponse.json({ error: 'La parte del archivo es demasiado grande.' }, { status: 413 })
  }
  try {
    const parte = await leerCuerpoLimitado(req, PARTE_ARCHIVO_BYTES)
    const bytes = await guardarParteTemporal(ref, usuario.id, Number(offset), parte)
    return NextResponse.json({ bytes })
  } catch (e) {
    if (e instanceof ErrorNegocio) return NextResponse.json({ error: e.message }, { status: e instanceof ErrorParteEnCurso ? 409 : e instanceof ErrorCuerpoGrande ? 413 : 400 })
    console.error('No se pudo guardar la parte del archivo:', e)
    return NextResponse.json({ error: 'No se pudo guardar el archivo. Inténtalo de nuevo.' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { ErrorNegocio } from '@/server/accion'
import { guardarArchivoTemporal, prepararSubidaDirecta } from '@/server/archivos-temporales'
import { MAX_PDF_BYTES, mensajePdfPesado, tipoDeArchivo, type ModoArchivo } from '@/lib/archivos'

export const runtime = 'nodejs'

const modoDe = (v: unknown): ModoArchivo => (v === 'evidencia' ? 'evidencia' : 'firma')

/**
 * Depósito temporal de archivos (ver `src/server/archivos-temporales.ts`). Dos
 * modos, y el navegador pregunta primero cuál toca:
 *
 *  - JSON `{ bytes, nombre, mimeType, modo }` → si el almacenamiento puede
 *    firmar una subida, devuelve `{ modo: 'directo', url, ref }`: el archivo va
 *    del navegador a Supabase sin pasar por aquí. Es lo único que funciona con
 *    archivos grandes en producción, donde el cuerpo de una petición al
 *    servidor se corta en ~4,5 MB.
 *  - multipart con el archivo → el servidor lo guarda (desarrollo, o respaldo).
 *
 * `modo` dice qué se admite: `firma` solo PDF (la app tiene que abrirlo para
 * firmarlo), `evidencia` también comprimidos (solo se archiva). Basta con estar
 * dentro de la app: el permiso de verdad lo exige la acción que use la
 * referencia, y la referencia solo le sirve a quien la pidió.
 */
export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const { bytes, nombre, mimeType, modo } = (await req.json()) as {
        bytes?: number; nombre?: string; mimeType?: string; modo?: string
      }
      const directa = await prepararSubidaDirecta(usuario.id, Number(bytes) || 0, {
        mimeType: mimeType || 'application/pdf',
        nombre: typeof nombre === 'string' ? nombre : undefined,
        modo: modoDe(modo),
      })
      return NextResponse.json(directa ? { modo: 'directo', ...directa } : { modo: 'multipart' })
    }

    // Se corta por el tamaño anunciado antes de leer el cuerpo completo.
    const anunciado = Number(req.headers.get('content-length') ?? 0)
    if (anunciado > MAX_PDF_BYTES + 64 * 1024) {
      return NextResponse.json({ error: mensajePdfPesado(anunciado) }, { status: 413 })
    }
    const form = await req.formData()
    const archivo = form.get('archivo')
    if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
    if (archivo.size > MAX_PDF_BYTES) return NextResponse.json({ error: mensajePdfPesado(archivo.size) }, { status: 413 })

    const r = await guardarArchivoTemporal(Buffer.from(await archivo.arrayBuffer()), usuario.id, {
      mimeType: tipoDeArchivo(archivo),
      nombre: archivo.name,
      modo: modoDe(form.get('modo')),
    })
    return NextResponse.json({ modo: 'multipart', ref: r.ref, bytes: r.bytes, nombre: archivo.name })
  } catch (e) {
    if (e instanceof ErrorNegocio) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('No se pudo preparar el archivo temporal:', e)
    return NextResponse.json({ error: 'No se pudo subir el archivo. Inténtalo de nuevo.' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { ErrorNegocio } from '@/server/accion'
import { guardarPdfTemporal } from '@/server/archivos-temporales'
import { MAX_PDF_BYTES, mensajePdfPesado } from '@/lib/archivos'

export const runtime = 'nodejs'

/**
 * Depósito temporal de PDF (ver `src/server/archivos-temporales.ts`): el
 * navegador sube aquí el archivo por partes y recibe una referencia firmada
 * que luego entrega a la Server Action (`pdfRef`). Basta con estar dentro de
 * la app: el permiso de verdad lo exige la acción que use la referencia, y la
 * referencia solo le sirve a quien la subió.
 */
export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Se corta por el tamaño anunciado antes de leer el cuerpo completo.
  const anunciado = Number(req.headers.get('content-length') ?? 0)
  if (anunciado > MAX_PDF_BYTES + 64 * 1024) {
    return NextResponse.json({ error: mensajePdfPesado(anunciado) }, { status: 413 })
  }

  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
  if (archivo.size > MAX_PDF_BYTES) return NextResponse.json({ error: mensajePdfPesado(archivo.size) }, { status: 413 })

  try {
    const r = await guardarPdfTemporal(Buffer.from(await archivo.arrayBuffer()), usuario.id)
    return NextResponse.json({ ref: r.ref, bytes: r.bytes, nombre: archivo.name })
  } catch (e) {
    if (e instanceof ErrorNegocio) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('No se pudo guardar el PDF temporal:', e)
    return NextResponse.json({ error: 'No se pudo guardar el PDF. Inténtalo de nuevo.' }, { status: 500 })
  }
}

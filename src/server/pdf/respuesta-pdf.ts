import 'server-only'
import { NextResponse } from 'next/server'

/**
 * Respuesta HTTP con un PDF generado al vuelo (muestras y vistas previas: nada
 * que esté guardado como Documento). Con `descargar` se baja en vez de
 * mostrarse: es lo que usa el botón de descarga del visor embebido.
 */
export function respuestaPdf(pdf: Buffer, nombre: string, descargar: boolean): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

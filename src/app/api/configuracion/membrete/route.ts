import { NextResponse } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { MEMBRETE_FONDO } from '@/server/pdf/assets/membrete-fondo'

export const runtime = 'nodejs'

/**
 * Imagen del papel membretado vigente, para verla en Configuración.
 *
 * Vive detrás de la sesión porque el archivo está en el almacenamiento privado,
 * no en `public/`: no hay URL directa que se pueda poner en un <img>.
 */
export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'configuracion', 'VER')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const empresa = await prisma.configuracionEmpresa.findFirst({ select: { membreteFondoPath: true } })
  const ruta = empresa?.membreteFondoPath

  if (!ruta) {
    // El de fábrica viene embebido como data URI: se devuelve su contenido para
    // que la vista previa no tenga que distinguir entre uno y otro.
    const coma = MEMBRETE_FONDO.indexOf(',')
    const mime = MEMBRETE_FONDO.slice(5, MEMBRETE_FONDO.indexOf(';'))
    const bytes = Buffer.from(MEMBRETE_FONDO.slice(coma + 1), 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store' },
    })
  }

  try {
    const contenido = await leerArchivo(ruta)
    const ext = ruta.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    return new NextResponse(new Uint8Array(contenido), {
      headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el membrete' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { rutaMiniatura } from '@/lib/foto'

export const runtime = 'nodejs'

/**
 * Foto de perfil. Es la petición más repetida de la app (una por persona en
 * cada lista), así que va lo más liviana posible:
 *  - solo comprueba que hay sesión (una consulta), sin cargar roles ni permisos:
 *    la foto de un compañero no es dato reservado;
 *  - `?t=mini` sirve la miniatura de 96 px cuando existe (fotos subidas desde
 *    que se generan), y si no cae a la completa;
 *  - con `?v=` en la URL (ver `urlFoto`) el navegador la guarda un día: al
 *    cambiar la foto cambia la URL, así que nunca se ve una vieja.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ colaboradorId: string }> }) {
  const { colaboradorId } = await params
  const sesion = await auth.api.getSession({ headers: await headers() })
  if (!sesion?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { fotoPath: true } })
  if (!c?.fotoPath) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })

  const mini = req.nextUrl.searchParams.get('t') === 'mini'
  const versionada = req.nextUrl.searchParams.has('v')
  try {
    let contenido: Buffer | null = null
    if (mini) contenido = await leerArchivo(rutaMiniatura(c.fotoPath)).catch(() => null)
    if (!contenido) contenido = await leerArchivo(c.fotoPath)
    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': versionada ? 'private, max-age=86400, immutable' : 'private, max-age=300',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto' }, { status: 500 })
  }
}

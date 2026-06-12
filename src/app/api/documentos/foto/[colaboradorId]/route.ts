import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ colaboradorId: string }> }) {
  const { colaboradorId } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { fotoPath: true } })
  if (!c?.fotoPath) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })

  try {
    const contenido = await leerArchivo(c.fotoPath)
    return new NextResponse(new Uint8Array(contenido), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto' }, { status: 500 })
  }
}

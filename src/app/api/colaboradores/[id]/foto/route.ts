import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { subirArchivo, eliminarArchivo } from '@/server/storage'

export const runtime = 'nodejs'
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'colaboradores', 'EDITAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'Imagen muy grande' }, { status: 413 })

  const c = await prisma.colaborador.findUnique({ where: { id }, select: { fotoPath: true } })
  if (!c) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo(`colaborador/${id}/foto`, archivo.name || 'foto.jpg', contenido, archivo.type || 'image/jpeg')
  if (c.fotoPath) await eliminarArchivo(c.fotoPath)
  await prisma.colaborador.update({ where: { id }, data: { fotoPath: subido.storagePath } })

  return NextResponse.json({ ok: true })
}

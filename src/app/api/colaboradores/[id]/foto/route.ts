import { NextResponse, after, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { subirArchivo, subirArchivoEn, eliminarArchivo } from '@/server/storage'
import { rutaMiniatura } from '@/lib/foto'
import { enviarFotoAsistencia, quitarFotoAsistencia } from '@/server/asistencia/fotos-asistencia'

export const runtime = 'nodejs'
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Quien edita fichas, o la propia persona sobre SU foto.
  if (!tienePermiso(usuario, 'colaboradores', 'EDITAR') && usuario.colaboradorId !== id) {
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
  // La miniatura (96 px) la manda el navegador junto a la foto; si no llega, las
  // listas caen a la completa.
  const miniatura = form.get('miniatura')
  if (miniatura instanceof File && miniatura.size > 0) {
    await subirArchivoEn(rutaMiniatura(subido.storagePath), Buffer.from(await miniatura.arrayBuffer()), 'image/jpeg').catch(() => {})
  }
  if (c.fotoPath) {
    await eliminarArchivo(c.fotoPath)
    await eliminarArchivo(rutaMiniatura(c.fotoPath)).catch(() => {})
  }
  await prisma.colaborador.update({ where: { id }, data: { fotoPath: subido.storagePath } })
  // La misma foto en AsistencIA, sin hacer esperar a quien la subió.
  after(() => enviarFotoAsistencia(id))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'colaboradores', 'EDITAR') && usuario.colaboradorId !== id) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const c = await prisma.colaborador.findUnique({ where: { id }, select: { fotoPath: true } })
  if (!c) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (c.fotoPath) {
    await eliminarArchivo(c.fotoPath)
    await eliminarArchivo(rutaMiniatura(c.fotoPath)).catch(() => {})
  }
  await prisma.colaborador.update({ where: { id }, data: { fotoPath: null } })
  after(() => quitarFotoAsistencia(id))

  return NextResponse.json({ ok: true })
}

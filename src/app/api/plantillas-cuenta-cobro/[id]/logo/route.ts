import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { subirArchivo, eliminarArchivo } from '@/server/storage'

export const runtime = 'nodejs'
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario || !tienePermiso(usuario, 'configuracion', 'EDITAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }
  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'Imagen muy grande (máx 4 MB)' }, { status: 413 })

  const plantilla = await prisma.plantillaCuentaCobro.findUnique({ where: { id }, select: { logoPath: true } })
  if (!plantilla) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo(`plantillas-cuenta-cobro/${id}`, archivo.name || 'logo.png', contenido, archivo.type || 'image/png')
  if (plantilla.logoPath) await eliminarArchivo(plantilla.logoPath)
  await prisma.plantillaCuentaCobro.update({ where: { id }, data: { logoPath: subido.storagePath } })
  return NextResponse.json({ ok: true })
}

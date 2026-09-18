import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo, eliminarArchivo, leerArchivo } from '@/server/storage'
import { ejecutarConContexto } from '@/server/contexto'
import { puedeGestionarAvisos } from '@/server/avisos'

/**
 * Captura de pantalla de un aviso de la plataforma: la sube quien gestiona
 * los avisos (administrador o Talento Humano) y la ve cualquiera con sesión,
 * porque un aviso es para toda su audiencia.
 */

export const runtime = 'nodejs'
const MAX_BYTES = 8 * 1024 * 1024
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sesion = await auth.api.getSession({ headers: await headers() })
  if (!sesion?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const a = await prisma.aviso.findUnique({ where: { id }, select: { imagenPath: true } })
  if (!a?.imagenPath) return NextResponse.json({ error: 'Sin imagen' }, { status: 404 })
  try {
    const contenido = await leerArchivo(a.imagenPath)
    const ext = a.imagenPath.split('.').pop()?.toLowerCase() ?? 'jpg'
    return new NextResponse(new Uint8Array(contenido), {
      headers: { 'Content-Type': MIME[ext] ?? 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la imagen' }, { status: 404 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeGestionarAvisos(usuario)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen supera los 8 MB' }, { status: 413 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return NextResponse.json({ error: 'La captura debe ser JPG, PNG o WebP' }, { status: 400 })
  }

  const a = await prisma.aviso.findUnique({ where: { id }, select: { imagenPath: true } })
  if (!a) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo(`avisos/${id}`, archivo.name || 'captura.png', contenido, archivo.type)
  if (a.imagenPath) await eliminarArchivo(a.imagenPath).catch(() => {})
  await ejecutarConContexto({ userId: usuario.id, userEmail: usuario.email, ip: req.headers.get('x-forwarded-for') }, async () => {
    await dbAuditado.aviso.update({ where: { id }, data: { imagenPath: subido.storagePath } })
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!puedeGestionarAvisos(usuario)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const a = await prisma.aviso.findUnique({ where: { id }, select: { imagenPath: true } })
  if (!a) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (a.imagenPath) await eliminarArchivo(a.imagenPath).catch(() => {})
  await ejecutarConContexto({ userId: usuario.id, userEmail: usuario.email, ip: req.headers.get('x-forwarded-for') }, async () => {
    await dbAuditado.aviso.update({ where: { id }, data: { imagenPath: null } })
  })
  return NextResponse.json({ ok: true })
}

import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo, eliminarArchivo, leerArchivo } from '@/server/storage'
import { ejecutarConContexto } from '@/server/contexto'

/** Las escrituras van auditadas con quien las hizo, como en las Server Actions. */
const conQuien = (usuario: { id: string; email: string }, req: NextRequest, fn: () => Promise<void>) =>
  ejecutarConContexto({ userId: usuario.id, userEmail: usuario.email, ip: req.headers.get('x-forwarded-for') }, fn)

/**
 * Foto de un activo (celular, computador, silla…): la sube quien administra
 * Activos y la ve cualquiera con sesión —en Mis entregas es la imagen de la
 * tarjeta del colaborador que lo tiene a cargo—. No es un documento del
 * expediente: es la ilustración del inventario.
 */

export const runtime = 'nodejs'
const MAX_BYTES = 8 * 1024 * 1024
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sesion = await auth.api.getSession({ headers: await headers() })
  if (!sesion?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const a = await prisma.activo.findUnique({ where: { id }, select: { fotoPath: true } })
  if (!a?.fotoPath) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })
  try {
    const contenido = await leerArchivo(a.fotoPath)
    const ext = a.fotoPath.split('.').pop()?.toLowerCase() ?? 'jpg'
    return new NextResponse(new Uint8Array(contenido), {
      headers: { 'Content-Type': MIME[ext] ?? 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto' }, { status: 404 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'activos', 'EDITAR')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen supera los 8 MB' }, { status: 413 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return NextResponse.json({ error: 'La foto debe ser JPG, PNG o WebP' }, { status: 400 })
  }

  const a = await prisma.activo.findUnique({ where: { id }, select: { fotoPath: true } })
  if (!a) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const subido = await subirArchivo(`activo/${id}/foto`, archivo.name || 'foto.jpg', contenido, archivo.type)
  if (a.fotoPath) await eliminarArchivo(a.fotoPath).catch(() => {})
  await conQuien(usuario, req, async () => { await dbAuditado.activo.update({ where: { id }, data: { fotoPath: subido.storagePath } }) })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'activos', 'EDITAR')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const a = await prisma.activo.findUnique({ where: { id }, select: { fotoPath: true } })
  if (!a) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (a.fotoPath) await eliminarArchivo(a.fotoPath).catch(() => {})
  await conQuien(usuario, req, async () => { await dbAuditado.activo.update({ where: { id }, data: { fotoPath: null } }) })
  return NextResponse.json({ ok: true })
}

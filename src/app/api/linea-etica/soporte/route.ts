import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { subirArchivo } from '@/server/storage'
import { obtenerArchivoAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'

export const runtime = 'nodejs'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

/**
 * Evidencias de un reporte de la línea ética (fotos, PDF, audios, videos).
 *
 * Va aparte de /api/documentos/subir a propósito: ese endpoint atribuye el
 * documento a quien lo sube y lo audita, y la línea ética es confidencial —no
 * se guarda quién reportó ni quién adjuntó—. Aquí la prueba de que el archivo
 * es del reporte correcto es el código de seguimiento, que solo conoce quien
 * lo envió; el documento queda sin autor y con nivel de acceso de Jurídica.
 */
export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'autoservicio', 'CREAR')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData()
  const archivo = form.get('archivo')
  const codigo = String(form.get('codigo') ?? '').trim().toUpperCase()
  // Más de 4 MB no cabe en el cuerpo de la función: llega la referencia al depósito temporal.
  const archivoRef = String(form.get('archivoRef') ?? '')
  if (!(archivo instanceof File) && !archivoRef) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (archivo instanceof File && archivo.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo supera 25 MB' }, { status: 413 })
  if (!/^DA-[0-9A-F]{8}$/.test(codigo)) return NextResponse.json({ error: 'Código no válido' }, { status: 400 })

  const denuncia = await prisma.denunciaAcoso.findUnique({ where: { codigo }, select: { id: true, estado: true } })
  if (!denuncia) return NextResponse.json({ error: 'Código no válido' }, { status: 404 })
  if (denuncia.estado === 'RESUELTA' || denuncia.estado === 'ARCHIVADA') {
    return NextResponse.json({ error: 'Este reporte ya está cerrado.' }, { status: 409 })
  }

  try {
    let nombre: string, mimeType: string, contenido: Buffer
    if (archivo instanceof File) {
      nombre = archivo.name; mimeType = archivo.type || 'application/octet-stream'; contenido = Buffer.from(await archivo.arrayBuffer())
    } else {
      const a = await obtenerArchivoAdjunto({ pdfRef: archivoRef }, usuario.id)
      nombre = String(form.get('archivoNombre') ?? '') || a.nombre || 'evidencia'; mimeType = a.mimeType; contenido = a.contenido
      await borrarPdfTemporal(archivoRef, usuario.id).catch(() => {})
    }
    const subido = await subirArchivo(`denunciaacoso/${denuncia.id}`, nombre, contenido, mimeType)
    // prisma (sin auditar) y sin subidoPorId: nada apunta a quién lo aportó.
    const doc = await prisma.documento.create({
      data: {
        entidadTipo: 'DenunciaAcoso',
        entidadId: denuncia.id,
        nombre: `Evidencia — ${nombre}`,
        bucket: subido.bucket,
        storagePath: subido.storagePath,
        mimeType: subido.mimeType,
        tamanoBytes: subido.tamanoBytes,
        nivelAcceso: 'JURIDICA',
        subidoPorId: null,
      },
    })
    return NextResponse.json({ ok: true, id: doc.id })
  } catch (e) {
    console.error('Error subiendo evidencia de la línea ética:', e)
    return NextResponse.json({ error: 'No se pudo guardar el archivo' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { puedeVerNivel } from '@/server/documentos'
import { auditar } from '@/lib/auditoria'
import { ejecutarConContexto } from '@/server/contexto'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const doc = await prisma.documento.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // El colaborador siempre puede acceder a sus propios documentos (habeas data): desprendibles,
  // certificaciones, etc. Para el resto se valida el nivel de acceso del documento.
  const esPropio = doc.entidadTipo === 'Colaborador' && usuario.colaboradorId != null && doc.entidadId === usuario.colaboradorId
  if (!esPropio && !puedeVerNivel(usuario, doc.nivelAcceso)) {
    return NextResponse.json({ error: 'Sin permiso para este documento' }, { status: 403 })
  }

  try {
    const contenido = await leerArchivo(doc.storagePath)
    // Registra el acceso a documentos sensibles (Ley 1581 / trazabilidad)
    if (doc.nivelAcceso !== 'GENERAL') {
      await ejecutarConContexto({ userId: usuario.id, userEmail: usuario.email, ip: null }, () =>
        auditar('ACCESO', 'Documento', { registroId: doc.id, descripcion: `Acceso a documento ${doc.nombre}` }),
      )
    }
    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.nombre)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}

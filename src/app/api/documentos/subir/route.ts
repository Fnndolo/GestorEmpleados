import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { obtenerSesion } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { guardarDocumento } from '@/server/documentos'
import { ejecutarConContexto } from '@/server/contexto'

export const runtime = 'nodejs'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'documentos', 'CREAR') && !tienePermiso(usuario, 'colaboradores', 'EDITAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const form = await req.formData()
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo supera 25 MB' }, { status: 413 })
  }

  const entidadTipo = String(form.get('entidadTipo') ?? '')
  const entidadId = String(form.get('entidadId') ?? '')
  if (!entidadTipo || !entidadId) {
    return NextResponse.json({ error: 'Faltan datos de la entidad' }, { status: 400 })
  }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  try {
    const doc = await ejecutarConContexto(
      { userId: usuario.id, userEmail: usuario.email, ip },
      () =>
        guardarDocumento(
          usuario,
          {
            entidadTipo,
            entidadId,
            tipoDocumentoId: (form.get('tipoDocumentoId') as string) || null,
            nombre: (form.get('nombre') as string) || archivo.name,
            descripcion: (form.get('descripcion') as string) || null,
            fechaVencimiento: (form.get('fechaVencimiento') as string) || null,
            sedeId: (form.get('sedeId') as string) || null,
          },
          { nombre: archivo.name, mimeType: archivo.type || 'application/octet-stream', contenido },
        ),
    )
    return NextResponse.json({ ok: true, id: doc.id })
  } catch (e) {
    console.error('Error subiendo documento:', e)
    return NextResponse.json({ error: 'No se pudo guardar el documento' }, { status: 500 })
  }
}

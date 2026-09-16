import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { leerArchivo } from '@/server/storage'
import { puedeVerNivel } from '@/server/documentos'
import { auditar } from '@/lib/auditoria'
import { ejecutarConContexto } from '@/server/contexto'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Primero solo la sesión (una consulta). Los roles y permisos —dos consultas
  // más— se cargan únicamente si el documento los exige: la mayoría de lo que
  // se abre (fotos, soportes, contratos) es de nivel GENERAL.
  const sesion = await auth.api.getSession({ headers: await headers() })
  if (!sesion?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const doc = await prisma.documento.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const esGeneral = doc.nivelAcceso === 'GENERAL' && doc.entidadTipo !== 'AcuerdoEvaluacion'
  const usuario = esGeneral ? null : await obtenerSesion()
  if (!esGeneral) {
    if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    // El colaborador siempre puede acceder a sus propios documentos (habeas data): desprendibles,
    // certificaciones, etc. Para el resto se valida el nivel de acceso del documento.
    const esPropio = doc.entidadTipo === 'Colaborador' && usuario.colaboradorId != null && doc.entidadId === usuario.colaboradorId
    if (!esPropio && !puedeVerNivel(usuario, doc.nivelAcceso)) {
      return NextResponse.json({ error: 'Sin permiso para este documento' }, { status: 403 })
    }

    // Un acuerdo de evaluación previa pertenece al proceso de selección, no al
    // expediente de nadie: lo firma alguien que ni siquiera es colaborador.
    // El nivel GENERAL no alcanza para protegerlo —significa "cualquiera con
    // sesión"— y los niveles existentes tampoco: RRHH exige permiso de
    // `colaboradores`, que el propio empleado tiene para ver su ficha. Así que se
    // exige el permiso del módulo que sí gobierna esto: Contratación.
    if (doc.entidadTipo === 'AcuerdoEvaluacion' && !tienePermiso(usuario, 'contratos', 'VER')) {
      return NextResponse.json({ error: 'Sin permiso para este documento' }, { status: 403 })
    }
  }

  try {
    const contenido = await leerArchivo(doc.storagePath)
    // Registra el acceso a documentos sensibles (Ley 1581 / trazabilidad). Los
    // acuerdos de evaluación entran aunque su nivel sea GENERAL: llevan datos de
    // alguien que no es colaborador y conviene saber quién los abrió.
    if (doc.nivelAcceso !== 'GENERAL' || doc.entidadTipo === 'AcuerdoEvaluacion') {
      await ejecutarConContexto({ userId: sesion.user.id, userEmail: sesion.user.email, ip: null }, () =>
        auditar('ACCESO', 'Documento', { registroId: doc.id, descripcion: `Acceso a documento ${doc.nombre}` }),
      )
    }
    // Nombre de descarga con la extensión real (doc.nombre no la incluye).
    const ext = doc.storagePath.includes('.') ? '.' + doc.storagePath.split('.').pop() : ''
    const nombreArchivo = ext && !doc.nombre.toLowerCase().endsWith(ext.toLowerCase()) ? doc.nombre + ext : doc.nombre
    // ?descargar=1 fuerza la descarga; sin el parámetro se muestra embebido (visor).
    const disposicion = req.nextUrl.searchParams.get('descargar') === '1' ? 'attachment' : 'inline'

    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `${disposicion}; filename="${encodeURIComponent(nombreArchivo)}"`,
        // Diez minutos en el navegador: reabrir un PDF durante la misma sesión no
        // vuelve a bajarlo. Es privado (nunca en cachés compartidas) y corto
        // por si el archivo se reemplaza.
        'Cache-Control': 'private, max-age=600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}

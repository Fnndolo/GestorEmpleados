import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { obtenerSesion } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { guardarDocumento } from '@/server/documentos'
import { ejecutarConContexto } from '@/server/contexto'
import { prisma } from '@/lib/db'
import { avisarPorRol } from '@/server/notificaciones/avisar'

export const runtime = 'nodejs'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

  // Permiso: RR.HH./documentos, o el propio colaborador adjuntando a SU proceso disciplinario
  // (proceso o una de sus etapas: descargos, apelación), el soporte de SU solicitud de
  // autoservicio, la planilla PILA de SU cuenta de cobro o un documento a SU propia ficha.
  let permitido = tienePermiso(usuario, 'documentos', 'CREAR') || tienePermiso(usuario, 'colaboradores', 'EDITAR')
  let esAporteDelColaborador = false
  // Las excepciones "de dueño" exigen poder ACTUAR en autoservicio: un usuario
  // en solo consulta (rol "Consulta (retirado)") no puede subir nada.
  const puedeActuarEnAutoservicio = tienePermiso(usuario, 'autoservicio', 'CREAR')
  if (!permitido && puedeActuarEnAutoservicio && usuario.colaboradorId && entidadTipo === 'Colaborador' && entidadId === usuario.colaboradorId) {
    permitido = true
    esAporteDelColaborador = true
  }
  if (!permitido && puedeActuarEnAutoservicio && usuario.colaboradorId) {
    if (entidadTipo === 'ProcesoDisciplinario') {
      const proc = await prisma.procesoDisciplinario.findUnique({ where: { id: entidadId }, select: { colaboradorId: true } })
      if (proc?.colaboradorId === usuario.colaboradorId) permitido = true
    } else if (entidadTipo === 'EtapaProceso') {
      const etapa = await prisma.etapaProceso.findUnique({ where: { id: entidadId }, select: { proceso: { select: { colaboradorId: true } } } })
      if (etapa?.proceso.colaboradorId === usuario.colaboradorId) permitido = true
    } else if (entidadTipo === 'Solicitud') {
      const sol = await prisma.solicitud.findUnique({ where: { id: entidadId }, select: { colaboradorId: true } })
      if (sol?.colaboradorId === usuario.colaboradorId) permitido = true
    } else if (entidadTipo === 'CuentaCobroOps') {
      // El contratista adjunta la planilla PILA a SU cuenta de cobro.
      const cuenta = await prisma.cuentaCobroOps.findUnique({
        where: { id: entidadId },
        select: { colaboradorId: true, contratoOps: { select: { colaboradorId: true } } },
      })
      const dueno = cuenta?.colaboradorId ?? cuenta?.contratoOps?.colaboradorId
      if (dueno === usuario.colaboradorId) permitido = true
    }
  }
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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
    // Documento aportado por el propio colaborador a su ficha: avisar a Talento
    // Humano para que lo revise y clasifique (queda auditado quién lo subió).
    if (esAporteDelColaborador) {
      const colab = await prisma.colaborador.findUnique({ where: { id: entidadId }, select: { nombres: true, apellidos: true } })
      await avisarPorRol(['Recursos Humanos', 'Administrador'], {
        evento: 'documento_aportado',
        titulo: 'Un colaborador subió un documento a su expediente',
        mensaje: `${colab?.nombres ?? ''} ${colab?.apellidos ?? ''} subió "${doc.nombre}" a su hoja de vida. Revísalo y clasifícalo si corresponde.`,
        enlace: `/colaboradores/${entidadId}`,
        llamadoAccion: 'Ver el expediente',
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, id: doc.id })
  } catch (e) {
    console.error('Error subiendo documento:', e)
    return NextResponse.json({ error: 'No se pudo guardar el documento' }, { status: 500 })
  }
}

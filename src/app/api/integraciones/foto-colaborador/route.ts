import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { ejecutarConContexto } from '@/server/contexto'
import { subirArchivo } from '@/server/storage'

/**
 * Foto de perfil desde el sistema de asistencia (ArriveControl).
 *
 * Al registrar a un empleado en asistencia se captura su rostro; si el
 * colaborador NO tiene foto en el gestor, esa captura puede subirse aquí como
 * foto de perfil (con consentimiento marcado por el administrador que registra).
 *
 * Reglas:
 *  - Solo CREA: si el colaborador ya tiene foto, no se toca (409). La foto de
 *    perfil "oficial" se administra en el gestor; esto es solo el arranque.
 *  - Autenticación por la misma clave compartida de la integración de horas.
 */

export const runtime = 'nodejs'
export const maxDuration = 30

// La imagen viaja como data URL base64; 4 MB de imagen ≈ 5,4 MB de JSON.
const MAX_BASE64 = 6 * 1024 * 1024

export async function POST(req: NextRequest) {
  const clave = process.env.INTEGRACION_HORAS_API_KEY
  const enviada = req.headers.get('x-api-key')
  if (process.env.NODE_ENV === 'production' || clave) {
    if (!clave || enviada !== clave) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }

  let cuerpo: { colaboradorId?: string; imagen?: string; consentimiento?: boolean }
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const colaboradorId = String(cuerpo.colaboradorId ?? '').trim()
  const imagen = String(cuerpo.imagen ?? '')
  if (!colaboradorId || !imagen) {
    return NextResponse.json({ ok: false, error: 'Faltan colaboradorId o imagen.' }, { status: 400 })
  }
  if (cuerpo.consentimiento !== true) {
    return NextResponse.json({ ok: false, error: 'Falta el consentimiento explícito.' }, { status: 400 })
  }
  const m = imagen.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
  if (!m) return NextResponse.json({ ok: false, error: 'La imagen debe ser un data URL jpeg/png/webp.' }, { status: 400 })
  if (m[2].length > MAX_BASE64) return NextResponse.json({ ok: false, error: 'Imagen muy grande.' }, { status: 413 })

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { id: true, fotoPath: true, estado: true },
  })
  if (!colaborador || colaborador.estado === 'RETIRADO') {
    return NextResponse.json({ ok: false, error: 'Colaborador no encontrado o retirado.' }, { status: 404 })
  }
  if (colaborador.fotoPath) {
    // Ya tiene foto oficial: la integración nunca la pisa.
    return NextResponse.json({ ok: false, error: 'El colaborador ya tiene foto de perfil.' }, { status: 409 })
  }

  const contenido = Buffer.from(m[2], 'base64')
  const extension = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'

  await ejecutarConContexto(
    { userId: null, userEmail: 'integracion:asistencia', ip: req.headers.get('x-forwarded-for') },
    async () => {
      const subido = await subirArchivo(`colaborador/${colaboradorId}/foto`, `captura-asistencia.${extension}`, contenido, m[1])
      await dbAuditado.colaborador.update({ where: { id: colaboradorId }, data: { fotoPath: subido.storagePath } })
    },
  )

  return NextResponse.json({ ok: true })
}

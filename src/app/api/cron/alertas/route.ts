import { NextResponse, type NextRequest } from 'next/server'
import { procesarAlertas } from '@/server/vencimientos/despachador'
import { actualizarEstadosVacaciones } from '@/server/vacaciones-liquidacion'
import { alertarCortesDotacion, alertarInduccionPendiente } from '@/server/dotacion'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Cron diario de alertas (Vercel Cron, ~6:00 a.m. Bogotá / 11:00 UTC).
 * Protegido con CRON_SECRET. Idempotente y con catch-up (procesa fechas <= hoy).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const esperado = `Bearer ${process.env.CRON_SECRET}`
  // Vercel Cron envía el header; permitir también ejecución manual en dev
  if (process.env.NODE_ENV === 'production' && auth !== esperado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const resumen = await procesarAlertas()
    // Registro de vacaciones (RIT art. 35): estados EN_DISFRUTE/DISFRUTADA automáticos.
    const vacaciones = await actualizarEstadosVacaciones()
    // Cortes de dotación (arts. 230-232 CST): aviso a RRHH 15 días antes del límite.
    const dotacion = await alertarCortesDotacion()
    // Inducción obligatoria (RIT arts. 7 y 95): nuevos sin inducción registrada.
    const induccion = await alertarInduccionPendiente()
    return NextResponse.json({ ok: true, ...resumen, vacaciones, dotacion, induccion })
  } catch (e) {
    console.error('Error en cron de alertas:', e)
    return NextResponse.json({ error: 'Fallo en el procesamiento' }, { status: 500 })
  }
}

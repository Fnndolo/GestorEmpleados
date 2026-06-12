import { NextResponse, type NextRequest } from 'next/server'
import { procesarAlertas } from '@/server/vencimientos/despachador'

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
    return NextResponse.json({ ok: true, ...resumen })
  } catch (e) {
    console.error('Error en cron de alertas:', e)
    return NextResponse.json({ error: 'Fallo en el procesamiento' }, { status: 500 })
  }
}

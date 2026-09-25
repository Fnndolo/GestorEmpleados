import { NextResponse, type NextRequest } from 'next/server'
import { enviarJornadasDelDia } from '@/server/asistencia/resumen-dia'
import { conexionAsistencia, ErrorAsistencia } from '@/server/asistencia/cliente'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Cron de cada noche (Vercel Cron, 06:00 UTC ≈ 1:00 a. m. Bogotá): le manda a
 * cada colaborador que marcó en AsistencIA su jornada del día que terminó (el
 * de AYER, para alcanzar a quien trabaja hasta la medianoche), como
 * notificación en la app. Reemplaza el correo diario que mandaba AsistencIA.
 *
 * Protegido con CRON_SECRET. `?fecha=AAAA-MM-DD` repite un día puntual (no
 * duplica: cada aviso lleva su clave por persona y día).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await conexionAsistencia())) {
    return NextResponse.json({ ok: true, omitido: 'AsistencIA no está conectada.' })
  }

  const pedida = req.nextUrl.searchParams.get('fecha')
  const ayer = hoyBogota()
  ayer.setUTCDate(ayer.getUTCDate() - 1)
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : formatFechaISO(ayer)

  try {
    return NextResponse.json({ ok: true, ...(await enviarJornadasDelDia(fecha)) })
  } catch (e) {
    const mensaje = e instanceof ErrorAsistencia ? e.message : String(e)
    console.error('[cron jornada-asistencia]', mensaje)
    return NextResponse.json({ ok: false, fecha, error: mensaje }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { aplicarRetirosVencidos } from '@/server/terminaciones-retiro'
import { ejecutarConContexto } from '@/server/contexto'

export const runtime = 'nodejs'

/**
 * Cron de cada noche (Vercel Cron, 05:10 UTC ≈ 12:10 a. m. Bogotá): quien
 * terminó ayer su último día queda retirado (colaborador RETIRADO, contrato
 * TERMINADO, acceso de solo consulta). Hasta entonces seguía activo.
 * Protegido con CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const r = await ejecutarConContexto({ userId: null, userEmail: 'cron', ip: null }, () => aplicarRetirosVencidos())
  return NextResponse.json({ ok: true, ...r })
}

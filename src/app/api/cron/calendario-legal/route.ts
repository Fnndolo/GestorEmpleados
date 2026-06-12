import { NextResponse, type NextRequest } from 'next/server'
import { generarOcurrencias } from '@/server/calendario/generador'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Cron de horizonte del calendario legal (genera ocurrencias 120 días adelante). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const r = await generarOcurrencias(120)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('Error en cron calendario legal:', e)
    return NextResponse.json({ error: 'Fallo' }, { status: 500 })
  }
}

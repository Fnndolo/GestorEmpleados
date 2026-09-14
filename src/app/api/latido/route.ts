import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { ultimoCambio } from '@/server/latido'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Latido del sistema: la hora de la última escritura de datos. Lo consultan las
 * pantallas abiertas cada pocos segundos (`ActualizacionEnVivo`) y, si cambió
 * desde la última vez, refrescan sus datos en sitio, sin recargar.
 *
 * Es deliberadamente mínimo —una fila, una fecha— porque se llama mucho: pide
 * sesión (no es para anónimos) y nada más.
 */
export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json({ cambio: await ultimoCambio() }, { headers: { 'Cache-Control': 'private, no-store' } })
}

import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/server/sesion'
import { avisosParaUsuario } from '@/server/avisos'

export const runtime = 'nodejs'

/** Los avisos que le tocan al usuario + cuántos no ha leído (para el icono de avisos). */
export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ noLeidos: 0, avisos: [] })
  const avisos = await avisosParaUsuario(usuario)
  return NextResponse.json({
    noLeidos: avisos.filter((a) => !a.leido).length,
    avisos: avisos.slice(0, 15).map((a) => ({
      id: a.id, titulo: a.titulo, resumen: a.resumen, tipo: a.tipo, enlace: a.enlace,
      leido: a.leido, vigente: a.vigente, publicadoEn: a.publicadoEn.toISOString(),
    })),
  })
}

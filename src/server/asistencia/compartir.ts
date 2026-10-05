import 'server-only'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CAMPO_COMPARTIDO, DATOS_COMPARTIDOS, type DatoCompartido } from '@/lib/integraciones'

/**
 * Para las puertas que AsistencIA golpea (colaboradores, horas, fotos): si ese
 * dato está apagado en Ajustes → Integraciones, la respuesta 403 que se
 * devuelve; si está encendido, null y la petición sigue. Se revisa DESPUÉS de
 * la clave: a quien no la tiene no se le cuenta qué está apagado.
 */
export async function puertaCerrada(dato: DatoCompartido): Promise<NextResponse | null> {
  const c = await prisma.configuracionEmpresa.findFirst({ select: { [CAMPO_COMPARTIDO[dato]]: true } })
  if (!c || c[CAMPO_COMPARTIDO[dato]] !== false) return null
  const titulo = DATOS_COMPARTIDOS.find((d) => d.clave === dato)!.titulo.toLowerCase()
  return NextResponse.json({ ok: false, error: `La empresa no comparte ${titulo} con AsistencIA (apagado en la plataforma de gestión humana).` }, { status: 403 })
}

'use server'

import { cookies } from 'next/headers'
import { requerirSesion } from '@/server/sesion'
import { COOKIE_SEDE, sedesDisponibles } from '@/server/sede-actual'

export async function cambiarSede(sedeId: string) {
  const usuario = await requerirSesion()
  // Solo se acepta 'todas' o una sede que el usuario realmente puede consultar.
  // Sin esto, un rol de alcance limitado podía fijar la cookie a una sede ajena.
  if (sedeId !== 'todas') {
    const permitidas = await sedesDisponibles(usuario)
    if (!permitidas.some((s) => s.id === sedeId)) return
  }
  const c = await cookies()
  c.set(COOKIE_SEDE, sedeId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

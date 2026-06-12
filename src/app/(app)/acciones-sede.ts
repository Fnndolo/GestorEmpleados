'use server'

import { cookies } from 'next/headers'
import { COOKIE_SEDE } from '@/server/sede-actual'

export async function cambiarSede(sedeId: string) {
  const c = await cookies()
  c.set(COOKIE_SEDE, sedeId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * Comprobación optimista de sesión en el edge (solo mira la cookie; la
 * verificación real de permisos ocurre en cada Server Action / RSC).
 */
export function middleware(request: NextRequest) {
  const sesion = getSessionCookie(request)
  if (!sesion) {
    const url = new URL('/login', request.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Protege todo salvo login, recursos públicos y endpoints de auth/cron.
  // `api/integraciones` queda fuera porque no usa sesión de navegador: se
  // autentica con la clave compartida X-API-Key dentro de cada handler.
  // `firmar-acuerdo` también: lo abre el ASPIRANTE, que no tiene cuenta; su
  // autorización es el token del enlace, comprobado en la propia página y en la
  // acción de subida.
  matcher: [
    '/((?!login|cambiar-password|firmar-acuerdo|api/auth|api/cron|api/integraciones|_next/static|_next/image|favicon.ico|icono.svg|manifest.webmanifest|sw.js|offline|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)',
  ],
}

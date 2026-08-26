import { vi } from 'vitest'
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Permite ejecutar las Server Actions reales fuera de Next.
 *
 * Una Server Action no se puede llamar a secas: `accion()` pide la sesión y los
 * encabezados de la petición, que solo existen dentro del servidor de Next. Aquí
 * se inyecta quién está actuando y se dejan pasar los encabezados vacíos.
 *
 * Lo que NO se falsea es la verificación de permisos: `requerirPermiso` sigue
 * comprobando con `tienePermiso` los permisos que el rol tiene de verdad en la
 * base. Si se saltara, las pruebas dirían que un empleado puede liquidar la
 * nómina — que es justo lo que hay que descartar.
 */

let sesionActual: UsuarioSesion | null = null

/** Quién ejecuta las acciones de aquí en adelante. `null` = sin sesión. */
export function actuarComo(usuario: UsuarioSesion | null) {
  sesionActual = usuario
}

export function instalarSesionFalsa() {
  vi.mock('next/headers', () => ({
    headers: async () => new Map<string, string>(),
    cookies: async () => ({ get: () => undefined, set: () => {} }),
  }))

  vi.mock('next/cache', () => ({
    revalidatePath: () => {},
    revalidateTag: () => {},
    unstable_cache: (fn: unknown) => fn,
  }))

  vi.mock('@/server/sesion', async (original) => {
    const real = await original<typeof import('@/server/sesion')>()
    const exigirSesion = () => {
      if (!sesionActual) throw new real.ErrorPermiso('sesion', 'VER')
      return sesionActual
    }
    return {
      ...real,
      obtenerSesion: async () => sesionActual,
      requerirSesion: async () => exigirSesion(),
      requerirPermiso: async (modulo: never, accion: never) => {
        const u = exigirSesion()
        // La comprobación real, con los permisos que trae el rol de la base.
        if (!real.tienePermiso(u, modulo, accion)) throw new real.ErrorPermiso(modulo, accion)
        return u
      },
    }
  })
}

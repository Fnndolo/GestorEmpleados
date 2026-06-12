import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexto de la petición actual (usuario + IP), propagado con AsyncLocalStorage.
 * Lo consume la extensión de auditoría (src/lib/auditoria.ts) para saber QUIÉN
 * ejecuta cada mutación sin tener que pasar el usuario manualmente a cada query.
 */
export type ContextoPeticion = {
  userId: string | null
  userEmail: string | null
  ip: string | null
}

export const almacenContexto = new AsyncLocalStorage<ContextoPeticion>()

export function contextoActual(): ContextoPeticion {
  return (
    almacenContexto.getStore() ?? { userId: null, userEmail: null, ip: null }
  )
}

export function ejecutarConContexto<T>(ctx: ContextoPeticion, fn: () => Promise<T>): Promise<T> {
  return almacenContexto.run(ctx, fn)
}

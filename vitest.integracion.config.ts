import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Pruebas de integración: ejercitan el código real de servidor contra la base
 * de datos LOCAL, no funciones puras aisladas.
 *
 * Van en su propia configuración y no en `pnpm test` porque necesitan la base
 * levantada: mezclarlas haría que la suite rápida dejara de correr en cualquier
 * máquina sin PostgreSQL.
 *
 *   pnpm db:start        (en otra terminal)
 *   pnpm test:integracion
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['pruebas/**/*.prueba.ts'],
    // Comparten una sola base: en paralelo se pisarían los datos entre sí.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['pruebas/preparar.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` existe para reventar si un módulo de servidor se cuela en
      // el bundle del cliente. Fuera de Next revienta siempre, así que aquí se
      // reemplaza por un módulo vacío: estas pruebas SON el servidor.
      'server-only': fileURLToPath(new URL('./pruebas/vacio.ts', import.meta.url)),
    },
  },
})

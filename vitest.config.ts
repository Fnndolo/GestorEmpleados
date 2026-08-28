import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` existe para reventar si un módulo de servidor se importa
      // desde el cliente, y revienta igual dentro de vitest. Se neutraliza aquí
      // para poder probar el código de `src/server`; el guard sigue vigente en
      // el build real, que es donde importa.
      'server-only': fileURLToPath(new URL('./src/test/server-only-noop.ts', import.meta.url)),
    },
  },
})

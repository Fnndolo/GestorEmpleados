import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de interfaz: abren la aplicación en un navegador de verdad.
 *
 * Es lo único que comprueba lo que las pruebas de servidor no pueden: que el
 * botón esté donde debe, que la pantalla no se rompa en un teléfono y que un
 * empleado no vea de refilón lo que no le toca.
 *
 * Levantan el servidor de desarrollo por su cuenta y lo apagan al terminar, así
 * que no hace falta tener `pnpm dev` corriendo aparte. Sí hace falta la base:
 *
 *   pnpm db:start      (en otra terminal)
 *   pnpm test:ui
 */
export default defineConfig({
  testDir: './pruebas-ui',
  // Comparten la misma base y el mismo usuario: en paralelo se estorbarían.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Compilado, no en desarrollo: en dev cada ruta se compila al primer
    // acceso y la hidratación tarda tanto que las esperas se vuelven ruido.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000/login',
    // Si ya hay un servidor levantado, se reutiliza en vez de fallar.
    reuseExistingServer: true,
    timeout: 300_000,
  },
})

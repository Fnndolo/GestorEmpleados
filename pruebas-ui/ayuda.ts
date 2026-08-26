import { expect, type Page } from '@playwright/test'

/** Cuentas del escenario de prueba (prisma/seed-escenario.ts). */
export const CUENTAS = {
  empleado: 'yeison.cordoba@prueba.local',
  jefe: 'diego.benavides@prueba.local',
  talentoHumano: 'monica.bastidas@prueba.local',
  contratista: 'oscar.delgado@prueba.local',
  admin: 'ricardo.pena@prueba.local',
} as const

export const PASSWORD = 'Prueba.2026*'

/**
 * Entra con una cuenta y espera a quedar dentro.
 *
 * Se reintenta porque el envío depende de que React ya haya hidratado: si se
 * pulsa antes, el navegador manda el formulario como HTML plano, la página
 * recarga en /login y el clic se pierde sin ningún mensaje de error.
 */
export async function entrarComo(page: Page, email: string) {
  for (let intento = 1; intento <= 2; intento++) {
    await page.goto('/login')
    // `networkidle` no sirve aquí: Next mantiene conexiones abiertas y nunca
    // llega a estar ocioso. Se espera al campo y se le da un respiro a la
    // hidratación, que es lo que hace falta para que el clic sea de React.
    await page.locator('#email').waitFor({ state: 'visible' })
    await page.waitForTimeout(1000)

    // Por id y no por etiqueta: el ojo de «mostrar contraseña» tiene un
    // aria-label que también contiene la palabra y el selector se vuelve ambiguo.
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
      return
    } catch {
      const mensaje = await page.locator('[role="alert"]').first().textContent().catch(() => null)
      // Credenciales malas: reintentar no arregla nada.
      if (mensaje?.includes('incorrect')) throw new Error(`No se pudo entrar como ${email}: ${mensaje}`)
      if (intento === 2) throw new Error(`No se pudo entrar como ${email} tras 2 intentos`)
    }
  }
}

/** Comprueba que la página no se desborde a lo ancho (scroll horizontal). */
export async function sinScrollHorizontal(page: Page) {
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  expect(desborda, 'la página no debe desplazarse a los lados').toBe(false)
}

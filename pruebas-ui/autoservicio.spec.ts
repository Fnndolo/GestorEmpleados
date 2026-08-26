import { test, expect } from '@playwright/test'
import { CUENTAS, entrarComo, sinScrollHorizontal } from './ayuda'

/**
 * El autoservicio visto en un navegador real.
 *
 * Comprueba lo que ninguna prueba de servidor puede ver: que la pantalla cargue,
 * que los accesos estén, que no se desborde en un teléfono y —lo más
 * importante— que un empleado no alcance por URL lo que su rol no le permite.
 * Esconder el botón no es una defensa; cerrar la ruta sí.
 */

test.describe('el empleado entra a su autoservicio', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, CUENTAS.empleado)
  })

  test('ve su panel con los trámites', async ({ page }) => {
    await page.goto('/autoservicio')
    await expect(page.getByText('¿Qué necesitas solicitar?')).toBeVisible()
    await expect(page.getByText('Contratos y canales')).toBeVisible()
  })

  test('los accesos principales están disponibles', async ({ page }) => {
    await page.goto('/autoservicio')
    // Por el nombre corto, que es el que se ve tanto en móvil como en escritorio.
    for (const nombre of ['Vacaciones', 'Permiso', 'Certificación', 'Documentos']) {
      await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible()
    }
  })

  test('abre el formulario de vacaciones', async ({ page }) => {
    await page.goto('/autoservicio')
    await page.getByText('Vacaciones', { exact: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('la línea ética se llama así y no «anti-acoso»', async ({ page }) => {
    await page.goto('/autoservicio/juridica?vista=anti-acoso')
    await expect(page.getByText('Línea ética').first()).toBeVisible()
    await expect(page.getByText('Canal anti-acoso')).toHaveCount(0)
  })

  test('puede ver sus desprendibles', async ({ page }) => {
    await page.goto('/autoservicio/desprendibles')
    await expect(page.locator('body')).not.toContainText('permiso')
  })
})

test.describe('lo que el empleado no alcanza por URL', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, CUENTAS.empleado)
  })

  for (const ruta of ['/nomina', '/colaboradores', '/configuracion/roles', '/juridica']) {
    test(`no entra a ${ruta}`, async ({ page }) => {
      const resp = await page.goto(ruta)
      const cuerpo = (await page.locator('body').textContent()) ?? ''
      const bloqueado =
        !page.url().includes(ruta) ||
        (resp?.status() ?? 200) >= 400 ||
        /sin permiso|no tienes permiso|404|no encontrad/i.test(cuerpo)
      expect(bloqueado, `${ruta} quedó accesible para un empleado`).toBe(true)
    })
  }
})

test.describe('en el teléfono', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo aplica a la vista móvil')

  test('el autoservicio no se desborda a lo ancho', async ({ page }) => {
    await entrarComo(page, CUENTAS.empleado)
    await page.goto('/autoservicio')
    await expect(page.getByText('¿Qué necesitas solicitar?')).toBeVisible()
    await sinScrollHorizontal(page)
  })

  test('los trámites van en carrusel, no en una pared vertical', async ({ page }) => {
    await entrarComo(page, CUENTAS.empleado)
    await page.goto('/autoservicio')
    const carrusel = page.locator('div.overflow-x-auto').first()
    await expect(carrusel).toBeVisible()
    // Un carrusel tiene más contenido del que cabe: si no, no es carrusel.
    const desborda = await carrusel.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(desborda, 'el carrusel debe tener más trámites de los que caben').toBe(true)
  })

  test('la lista de colaboradores tampoco se desborda', async ({ page }) => {
    await entrarComo(page, CUENTAS.admin)
    await page.goto('/colaboradores')
    await sinScrollHorizontal(page)
  })
})

test.describe('cada rol entra a lo suyo', () => {
  test('Talento Humano llega a colaboradores', async ({ page }) => {
    await entrarComo(page, CUENTAS.talentoHumano)
    await page.goto('/colaboradores')
    await expect(page.locator('body')).not.toContainText('No tienes permiso')
  })

  test('el jefe de área ve su bandeja de aprobaciones', async ({ page }) => {
    await entrarComo(page, CUENTAS.jefe)
    await page.goto('/autoservicio/aprobaciones')
    await expect(page.locator('body')).not.toContainText('No tienes permiso')
  })

  test('el contratista OPS ve sus cuentas de cobro', async ({ page }) => {
    await entrarComo(page, CUENTAS.contratista)
    await page.goto('/autoservicio/cuentas-cobro')
    await expect(page.locator('body')).not.toContainText('No tienes permiso')
  })
})

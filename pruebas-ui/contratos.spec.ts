import { test, expect, type Page } from '@playwright/test'
import { CUENTAS, entrarComo, sinScrollHorizontal } from './ayuda'

/**
 * El alta de contratos vista en un navegador real.
 *
 * Los formularios de alta (OPS y laboral) ya no son páginas aparte: se abren en
 * una ventana centrada sobre la lista de contratación. Aquí se comprueba lo que
 * solo un navegador puede ver: que el botón abra la ventana, que la ventana
 * quede centrada de verdad y no se salga en un teléfono, que un clic fuera no
 * la cierre (el formulario es largo y lleva un PDF) y que los enlaces viejos a
 * las rutas de alta sigan llevando al mismo sitio.
 */

/** La ventana debe estar centrada en la pantalla, con un par de píxeles de margen. */
async function esperarCentrado(page: Page, dialogo: ReturnType<Page['getByRole']>) {
  const caja = await dialogo.boundingBox()
  const vista = page.viewportSize()!
  expect(caja, 'la ventana debe tener tamaño').not.toBeNull()
  const centroX = caja!.x + caja!.width / 2
  const centroY = caja!.y + caja!.height / 2
  expect(Math.abs(centroX - vista.width / 2), 'centrada a lo ancho').toBeLessThan(3)
  expect(Math.abs(centroY - vista.height / 2), 'centrada a lo alto').toBeLessThan(3)
  // Y dentro de la pantalla: nada de asomarse por los bordes.
  expect(caja!.x).toBeGreaterThanOrEqual(0)
  expect(caja!.y).toBeGreaterThanOrEqual(0)
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(vista.width + 1)
  expect(caja!.y + caja!.height).toBeLessThanOrEqual(vista.height + 1)

  // Y nada recortado por dentro: la ventana esconde su desbordamiento
  // horizontal, así que un formulario más ancho que ella no se ve como scroll
  // de página sino como texto y botones cortados por el borde derecho.
  const recortado = await dialogo.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(recortado, 'el contenido de la ventana no debe recortarse a lo ancho').toBe(false)
}

test.describe('crear un contrato desde Contratación', () => {
  test.beforeEach(async ({ page }) => {
    await entrarComo(page, CUENTAS.admin)
  })

  test('«OPS» abre la ventana centrada con el formulario', async ({ page }) => {
    await page.goto('/contratos?tab=OPS')
    await page.getByRole('button', { name: 'Nuevo contrato OPS' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato OPS' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByText('PDF del contrato', { exact: true })).toBeVisible()
    await expect(dialogo.getByRole('button', { name: /Subir y enviar a firma/ })).toBeVisible()
    await esperarCentrado(page, dialogo)
    await sinScrollHorizontal(page)
    // La lista sigue debajo: no se navegó a otra página.
    await expect(page).toHaveURL(/\/contratos\?tab=OPS$/)
  })

  test('en OPS, la autorización de datos es opcional y se puede ver antes de enviar', async ({ page }) => {
    await page.goto('/contratos?tab=OPS')
    await page.getByRole('button', { name: 'Nuevo contrato OPS' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato OPS' })

    // Marcada por defecto: es lo normal. Sin contratista aún no hay qué mostrar.
    const casilla = dialogo.getByRole('checkbox', { name: /Generar autorización de datos/ })
    await expect(casilla).toBeChecked()
    await expect(dialogo.getByText('Elige a la persona para verla.')).toBeVisible()

    // Se elige al contratista del escenario por su documento.
    await dialogo.getByRole('combobox').first().click()
    await page.getByPlaceholder('Buscar por nombre o documento…').fill('10100011')
    await page.getByRole('option', { name: /Delgado/ }).first().click()

    // Ahora sí: la vista previa abre el visor con un PDF de verdad, con sus datos.
    await dialogo.getByRole('button', { name: /Ver cómo queda/ }).click()
    const visor = page.getByRole('dialog', { name: /Autorización de datos · vista previa/ })
    await expect(visor).toBeVisible()
    const enlace = visor.getByTitle('Abrir en otra pestaña')
    const url = await enlace.getAttribute('href')
    expect(url).toContain('/api/contratos/autorizacion-datos?')
    expect(url).toContain('vinculo=OPS')
    const respuesta = await page.request.get(url!)
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toContain('application/pdf')
    await page.keyboard.press('Escape')
    await expect(visor).toBeHidden()

    // Desmarcada, la vista previa desaparece: no habrá nada que generar.
    await casilla.click()
    await expect(casilla).not.toBeChecked()
    await expect(dialogo.getByRole('button', { name: /Ver cómo queda/ })).toHaveCount(0)
  })

  test('«Laboral» abre la ventana centrada con el formulario', async ({ page }) => {
    await page.goto('/contratos')
    await page.getByRole('button', { name: 'Nuevo contrato laboral' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato laboral' })
    await expect(dialogo).toBeVisible()
    // La misma interfaz que el OPS: una columna, el PDF al final y firma en la app.
    await expect(dialogo.getByText('Colaborador (quien va a firmar)')).toBeVisible()
    await expect(dialogo.getByText('PDF del contrato', { exact: true })).toBeVisible()
    await expect(dialogo.getByRole('checkbox', { name: /ya viene firmado por el empleador/ })).toBeVisible()
    await expect(dialogo.getByRole('button', { name: /Subir y enviar a firma/ })).toBeVisible()
    await esperarCentrado(page, dialogo)
    await sinScrollHorizontal(page)
    await expect(page).toHaveURL(/\/contratos$/)
  })

  test('un clic fuera no la cierra; Escape sí', async ({ page }) => {
    await page.goto('/contratos')
    await page.getByRole('button', { name: 'Nuevo contrato laboral' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato laboral' })
    await expect(dialogo).toBeVisible()

    // Esquina superior izquierda: fuera de la ventana en cualquier tamaño.
    await page.mouse.click(4, 4)
    await expect(dialogo).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
  })

  test('la X cierra la ventana sin salir de Contratación', async ({ page }) => {
    // Se llega desde otra pantalla a propósito: cerrar no debe volver atrás en
    // el historial, que desde la ventana sacaría de la lista entera.
    await page.goto('/inicio')
    await page.goto('/contratos')
    await page.getByRole('button', { name: 'Nuevo contrato laboral' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato laboral' })
    await expect(dialogo).toBeVisible()

    await dialogo.getByRole('button', { name: 'Close' }).click()
    await expect(dialogo).toBeHidden()
    await expect(page).toHaveURL(/\/contratos$/)
  })

  test('la casilla de autorización de datos está en OPS y en laboral, marcada por defecto', async ({ page }) => {
    await page.goto('/contratos')
    for (const nombre of ['Nuevo contrato laboral', 'Nuevo contrato OPS']) {
      await page.getByRole('button', { name: nombre }).click()
      const dialogo = page.getByRole('dialog', { name: nombre })
      await expect(dialogo).toBeVisible()

      const casilla = dialogo.getByRole('checkbox', { name: /Generar autorización de datos/ })
      await expect(casilla).toBeChecked()
      await expect(dialogo.getByText('Elige a la persona para verla.')).toBeVisible()
      await casilla.click()
      await expect(dialogo.getByText('Elige a la persona para verla.')).toHaveCount(0)

      await page.keyboard.press('Escape')
      await expect(dialogo).toBeHidden()
    }
  })

  test('los enlaces viejos a las rutas de alta abren la ventana', async ({ page }) => {
    await page.goto('/contratos/ops/nuevo')
    await expect(page).toHaveURL(/\/contratos\?tab=OPS&nuevo=ops$/)
    await expect(page.getByRole('dialog', { name: 'Nuevo contrato OPS' })).toBeVisible()

    await page.goto('/contratos/nuevo')
    await expect(page).toHaveURL(/\/contratos\?nuevo=laboral$/)
    const dialogo = page.getByRole('dialog', { name: 'Nuevo contrato laboral' })
    await expect(dialogo).toBeVisible()

    // Al cerrar se limpia `?nuevo=`: recargar no debe volver a abrirla.
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    await expect(page).toHaveURL(/\/contratos$/)
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

import 'dotenv/config'
import { Client } from 'pg'
import { test, expect } from '@playwright/test'
import { CUENTAS, entrarComo, sinScrollHorizontal } from './ayuda'

/**
 * Cumpleaños visto en un navegador real: Talento Humano asigna al encargado
 * desde la lista, el encargado ve el cumpleaños a su cargo en su autoservicio y
 * un empleado corriente no llega a la pantalla de TH.
 *
 * Los seeds no cargan fechas de nacimiento, así que la prueba le pone una a
 * Yeison (cumple dentro de cinco días) al empezar y la quita al terminar. Se
 * escribe directo en la base LOCAL, con la misma salvaguarda que las pruebas
 * de integración: contra cualquier otra base, no corre.
 */

const DOC_YEISON = '10100007'
const DOC_DIEGO = '10100006' // su jefe, que será el encargado
/** La fecha que tenía Yeison antes de la prueba, para dejarla como estaba. */
let fechaPrevia: string | null = null

async function baseLocal(): Promise<Client> {
  const url = process.env.DATABASE_URL ?? ''
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Esta prueba solo corre contra la base local.')
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

test.describe('cumpleaños', () => {
  test.beforeAll(async () => {
    const db = await baseLocal()
    try {
      const previa = await db.query<{ f: string | null }>('SELECT fecha_nacimiento::text AS f FROM colaborador WHERE numero_documento = $1', [DOC_YEISON])
      fechaPrevia = previa.rows[0]?.f ?? null
      // Cumple en cinco días: cae en el mes en curso o en el siguiente, que es lo que lista la pantalla.
      await db.query(
        `UPDATE colaborador SET fecha_nacimiento = (CURRENT_DATE + INTERVAL '5 days')::date - INTERVAL '30 years' WHERE numero_documento = $1`,
        [DOC_YEISON],
      )
      await db.query(`DELETE FROM celebracion_cumpleanos WHERE colaborador_id = (SELECT id FROM colaborador WHERE numero_documento = $1)`, [DOC_YEISON])
    } finally { await db.end() }
  })

  test.afterAll(async () => {
    const db = await baseLocal()
    try {
      await db.query(`DELETE FROM documento WHERE entidad_tipo = 'CelebracionCumpleanos' AND entidad_id IN (SELECT id FROM celebracion_cumpleanos WHERE colaborador_id = (SELECT id FROM colaborador WHERE numero_documento = $1))`, [DOC_YEISON])
      await db.query(`DELETE FROM celebracion_cumpleanos WHERE colaborador_id = (SELECT id FROM colaborador WHERE numero_documento = $1)`, [DOC_YEISON])
      await db.query(`UPDATE colaborador SET fecha_nacimiento = $2 WHERE numero_documento = $1`, [DOC_YEISON, fechaPrevia])
    } finally { await db.end() }
  })

  test('Talento Humano ve el cumpleaños, asigna al encargado y este lo ve en su autoservicio', async ({ page }) => {
    await entrarComo(page, CUENTAS.talentoHumano)
    await page.goto('/cumpleanos')
    await expect(page.getByRole('heading', { name: 'Cumpleaños' })).toBeVisible()
    await sinScrollHorizontal(page)

    await expect(page.getByText('Yeison Córdoba Palacios').first()).toBeVisible()
    await expect(page.getByText('Sin encargado').first()).toBeVisible()
    await page.getByRole('button', { name: /Asignar encargado a Yeison/ }).click()

    const dialogo = page.getByRole('dialog', { name: 'Asignar encargado' })
    await expect(dialogo).toBeVisible()
    await dialogo.getByRole('combobox').first().click()
    await page.getByPlaceholder('Buscar por nombre o documento…').fill(DOC_DIEGO)
    await page.getByRole('option', { name: /Benavides/ }).first().click()
    await dialogo.getByPlaceholder(/Qué comprar/).fill('Torta y decoración')
    await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()
    await expect(dialogo).toBeHidden()

    // La fila cambia de estado y muestra al encargado.
    await expect(page.getByText('Encargado asignado').first()).toBeVisible()
    await expect(page.getByText(/Encargado:.*Diego Benavides/).first()).toBeVisible()

    // El encargado lo ve en su autoservicio, con las indicaciones y la zona para las facturas.
    // Misma pestaña, otra persona: sin cerrar la sesión, /login redirige a la portada.
    await page.context().clearCookies()
    await entrarComo(page, CUENTAS.jefe)
    await page.goto('/autoservicio')
    await expect(page.getByRole('heading', { name: 'Cumpleaños a mi cargo' })).toBeVisible()
    await expect(page.getByText('Cumpleaños de Yeison Córdoba Palacios')).toBeVisible()
    await expect(page.getByText('Torta y decoración')).toBeVisible()
    await expect(page.getByRole('button', { name: /Entregar facturas/ })).toBeVisible()
    await sinScrollHorizontal(page)
  })

  test('un empleado no llega a la pantalla de cumpleaños', async ({ page }) => {
    await entrarComo(page, CUENTAS.empleado)
    await page.goto('/cumpleanos')
    // Sin permiso de bienestar la página no se muestra: se queda fuera (redirección o error), nunca con la lista.
    await expect(page.getByRole('heading', { name: 'Cumpleaños' })).toHaveCount(0)
    await expect(page.getByText('Asignar encargado')).toHaveCount(0)
  })
})

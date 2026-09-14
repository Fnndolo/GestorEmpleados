import 'dotenv/config'
import { Client } from 'pg'
import { test, expect } from '@playwright/test'
import { CUENTAS, entrarComo } from './ayuda'

/**
 * Los datos se refrescan solos, sin recargar: lo que cambia una persona lo ve
 * la otra en su pantalla abierta. Dos navegadores de verdad: Talento Humano
 * tiene abierta la lista de cumpleaños; el empleado cambia su fecha de
 * nacimiento desde su autoservicio; la fila de TH cambia sin que nadie toque
 * nada. Es la prueba del latido del sistema de punta a punta.
 *
 * Fija una fecha de nacimiento inicial en la base local (los seeds no la
 * cargan) y deja todo como estaba al terminar.
 */

const DOC_YEISON = '10100007'
let fechaPrevia: string | null = null

function iso(d: Date): string { return d.toISOString().slice(0, 10) }
function enDias(n: number): Date { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d }

async function baseLocal(): Promise<Client> {
  const url = process.env.DATABASE_URL ?? ''
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Esta prueba solo corre contra la base local.')
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

test.describe('actualización en vivo', () => {
  test.beforeAll(async () => {
    const db = await baseLocal()
    try {
      fechaPrevia = (await db.query<{ f: string | null }>('SELECT fecha_nacimiento::text AS f FROM colaborador WHERE numero_documento = $1', [DOC_YEISON])).rows[0]?.f ?? null
      await db.query(`UPDATE colaborador SET fecha_nacimiento = $2::date - INTERVAL '30 years' WHERE numero_documento = $1`, [DOC_YEISON, iso(enDias(5))])
      await db.query(`DELETE FROM celebracion_cumpleanos WHERE colaborador_id = (SELECT id FROM colaborador WHERE numero_documento = $1)`, [DOC_YEISON])
    } finally { await db.end() }
  })

  test.afterAll(async () => {
    const db = await baseLocal()
    try {
      await db.query(`UPDATE colaborador SET fecha_nacimiento = $2 WHERE numero_documento = $1`, [DOC_YEISON, fechaPrevia])
    } finally { await db.end() }
  })

  test('lo que cambia el empleado aparece en la pantalla de TH sin recargar', async ({ browser }) => {
    // Talento Humano, mirando los cumpleaños.
    const th = await browser.newPage()
    await entrarComo(th, CUENTAS.talentoHumano)
    await th.goto('/cumpleanos')
    const fila = th.getByText('Yeison Córdoba Palacios').first()
    await expect(fila).toBeVisible()
    const fechaAntes = th.getByText(new RegExp(diaLargo(enDias(5)))).first()
    await expect(fechaAntes).toBeVisible()

    // El empleado, en otro navegador, cambia su fecha de nacimiento.
    const empleado = await browser.newPage()
    await entrarComo(empleado, CUENTAS.empleado)
    await empleado.goto('/autoservicio/mi-informacion')
    const nueva = enDias(12)
    const campo = empleado.locator('input[name="fechaNacimiento"]')
    await expect(campo).toBeVisible()
    // Al hidratar, react-hook-form vuelve a escribir el valor por defecto en el
    // campo: si se llena antes, se pierde sin aviso (mismo cuidado que entrarComo).
    await empleado.waitForTimeout(1500)
    const valor = `${nueva.getUTCFullYear() - 30}-${String(nueva.getUTCMonth() + 1).padStart(2, '0')}-${String(nueva.getUTCDate()).padStart(2, '0')}`
    await campo.fill(valor)
    await expect(campo).toHaveValue(valor)
    await empleado.getByRole('button', { name: /Guardar mi información/ }).click()
    await expect(empleado.getByText(/Tu información fue guardada/)).toBeVisible()

    // Sin tocar la pantalla de TH: la fila muestra la fecha nueva en pocos segundos.
    await expect(th.getByText(new RegExp(diaLargo(nueva))).first()).toBeVisible({ timeout: 25_000 })
    await expect(th.getByText(new RegExp(diaLargo(enDias(5))))).toHaveCount(0)
    // Y sigue en la misma página: no hubo recarga ni navegación.
    await expect(th).toHaveURL(/\/cumpleanos$/)

    await empleado.close()
    await th.close()
  })
})

/** "16 de septiembre de 2026": como lo pinta la lista (es-CO, fecha larga). */
function diaLargo(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

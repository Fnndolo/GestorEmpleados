import 'dotenv/config'
import { Client } from 'pg'
import { test, expect } from '@playwright/test'
import { CUENTAS, entrarComo } from './ayuda'

/**
 * Cerrar un contrato OPS en un navegador real, por los dos caminos: desde su
 * detalle (aviso de plazo vencido, ventana con el motivo propuesto) y desde la
 * fila de la lista de Contratación. En los dos el contrato queda Terminado con
 * su fecha y motivo a la vista. Y un contrato laboral no se "cierra": su fila
 * lleva a Terminaciones con la persona ya elegida.
 *
 * Los OPS de prueba se crean directo en la base local y se borran al terminar.
 */

const DOC_OSCAR = '10100011' // el contratista del escenario
const DOC_YEISON = '10100007' // empleado con contrato laboral activo
let opsDetalle = { id: '', numero: '' }
let opsLista = { id: '', numero: '' }

async function baseLocal(): Promise<Client> {
  const url = process.env.DATABASE_URL ?? ''
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Esta prueba solo corre contra la base local.')
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

async function crearOps(db: Client) {
  const r = await db.query<{ id: string; numero: string }>(
    `INSERT INTO contrato_ops (id, numero, objeto, valor_total, sede_id, fecha_inicio, fecha_fin, estado, colaborador_id, creado_en, actualizado_en)
     SELECT gen_random_uuid(), 'PRUEBA-UI-CIERRE-' || floor(random() * 1e9)::text, 'Prueba de cierre', 1000000, c.sede_id,
            CURRENT_DATE - INTERVAL '100 days', CURRENT_DATE - INTERVAL '10 days', 'ACTIVO', c.id, now(), now()
     FROM colaborador c WHERE c.numero_documento = $1 RETURNING id, numero`,
    [DOC_OSCAR],
  )
  return r.rows[0]
}

test.describe('cierre de un OPS', () => {
  test.beforeAll(async () => {
    const db = await baseLocal()
    try {
      opsDetalle = await crearOps(db)
      opsLista = await crearOps(db)
    } finally { await db.end() }
  })

  test.afterAll(async () => {
    const db = await baseLocal()
    try {
      const ids = [opsDetalle.id, opsLista.id]
      await db.query(`DELETE FROM vencimiento WHERE entidad_tipo = 'ContratoOps' AND entidad_id = ANY($1::uuid[])`, [ids])
      await db.query(`DELETE FROM notificacion WHERE evento = 'contrato_cerrado' AND mensaje LIKE '%PRUEBA-UI-CIERRE-%'`)
      await db.query(`DELETE FROM contrato_ops WHERE id = ANY($1::uuid[])`, [ids])
    } finally { await db.end() }
  })

  test('TH ve el plazo vencido, cierra por vencimiento y el contrato queda Terminado', async ({ page }) => {
    await entrarComo(page, CUENTAS.talentoHumano)
    await page.goto(`/contratos/ops/${opsDetalle.id}`)
    await expect(page.getByText(/El plazo venció el/)).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar contrato' }).click()
    const dialogo = page.getByRole('dialog', { name: /Cerrar el contrato/ })
    await expect(dialogo).toBeVisible()
    // Vencido: el motivo propuesto es el vencimiento y la fecha es la pactada.
    await expect(dialogo.getByRole('combobox')).toContainText('Vencimiento del plazo')
    await expect(dialogo.getByText(/la de fin pactada/)).toBeVisible()
    await dialogo.getByPlaceholder(/contrato nuevo/).fill('Sigue con contrato nuevo')
    await dialogo.getByRole('button', { name: 'Cerrar contrato' }).click()
    await expect(dialogo).toBeHidden()

    // Queda Terminado, con su cierre a la vista, y el aviso de vencido desaparece.
    await expect(page.getByText('Terminado', { exact: true })).toBeVisible()
    await expect(page.getByText(/vencimiento del plazo · Sigue con contrato nuevo/)).toBeVisible()
    await expect(page.getByText(/El plazo venció el/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cerrar contrato' })).toHaveCount(0)
  })

  test('desde la lista de Contratación: la fila tiene "Cerrar" y al cerrar pasa a Terminado sin salir de la lista', async ({ page }) => {
    await entrarComo(page, CUENTAS.talentoHumano)
    await page.goto('/contratos?tab=OPS')
    const fila = page.locator(`[data-contrato="${opsLista.numero}"]`)
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('link', { name: 'Óscar Delgado Zambrano' })).toBeVisible()
    await expect(fila.getByText('Activo', { exact: true })).toBeVisible()

    await fila.getByRole('button', { name: `Cerrar contrato ${opsLista.numero}` }).click()
    const dialogo = page.getByRole('dialog', { name: `Cerrar el contrato ${opsLista.numero}` })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole('combobox')).toContainText('Vencimiento del plazo')
    await dialogo.getByRole('button', { name: 'Cerrar contrato' }).click()
    await expect(dialogo).toBeHidden()

    // Misma lista, la fila ya dice Terminado y ya no ofrece cerrar.
    await expect(page).toHaveURL(/\/contratos\?tab=OPS$/)
    await expect(fila.getByText('Terminado', { exact: true })).toBeVisible()
    await expect(fila.getByRole('button', { name: `Cerrar contrato ${opsLista.numero}` })).toHaveCount(0)
  })

  test('un contrato laboral no se cierra aquí: su fila lleva a Terminaciones con la persona elegida', async ({ page }) => {
    await entrarComo(page, CUENTAS.talentoHumano)
    await page.goto('/contratos?tab=TERMINO_INDEFINIDO')
    const fila = page.locator('[data-contrato]', { has: page.getByRole('link', { name: 'Yeison Córdoba Palacios' }) }).first()
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('button', { name: /Cerrar contrato/ })).toHaveCount(0)
    await fila.getByRole('link', { name: /Terminar contrato/ }).click()
    await expect(page).toHaveURL(/\/terminaciones\?colaborador=/)
    // Terminaciones abre la ventana de registro con la persona ya puesta, por su nombre.
    const dialogo = page.getByRole('dialog', { name: 'Registrar terminación' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole('combobox').first()).toContainText('Yeison Córdoba Palacios')
  })
})

/** Nombre completo del empleado, por si el escenario cambia: se comprueba en base. */
test.beforeAll(async () => {
  const db = await baseLocal()
  try {
    const r = await db.query<{ n: string }>(`SELECT nombres || ' ' || apellidos AS n FROM colaborador WHERE numero_documento = $1`, [DOC_YEISON])
    if (r.rows[0]?.n !== 'Yeison Córdoba Palacios') throw new Error(`El escenario cambió: el empleado 10100007 es "${r.rows[0]?.n}"`)
  } finally { await db.end() }
})

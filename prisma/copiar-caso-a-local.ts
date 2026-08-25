import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

/**
 * Copia a la base LOCAL el caso económico de un colaborador de producción, para
 * poder validar su liquidación sin tocar producción.
 *
 * Copia lo que entra en el cálculo —fecha de ingreso, tipo de contrato, salario,
 * auxilio de transporte, fechas— y NO los datos personales: el nombre, la cédula,
 * el correo y la cuenta bancaria se reemplazan por unos de prueba. La liquidación
 * no depende de quién es la persona, y arrastrar datos reales a un entorno de
 * desarrollo es exactamente lo que la Ley 1581 pide evitar.
 *
 *   ORIGEN_URL="<url produccion>" pnpm exec tsx prisma/copiar-caso-a-local.ts "MARLON"
 */
const origenUrl = process.env.ORIGEN_URL ?? ''
const destinoUrl = process.env.DATABASE_URL ?? ''
const busqueda = process.argv[2] ?? 'MARLON'

if (!origenUrl) {
  console.error('Falta ORIGEN_URL (la base de donde se copia).')
  process.exit(1)
}
if (!/localhost|127\.0\.0\.1/.test(destinoUrl)) {
  console.error('El destino debe ser la base local. DATABASE_URL apunta a otro servidor.')
  process.exit(1)
}

async function main() {
  const origen = new pg.Client({ connectionString: origenUrl })
  const destino = new pg.Client({ connectionString: destinoUrl })
  await origen.connect()
  await destino.connect()

  const { rows: colabs } = await origen.query(
    `SELECT id, fecha_ingreso, tipo_vinculo, estado FROM colaborador WHERE nombres ILIKE $1`,
    [`%${busqueda}%`],
  )
  if (colabs.length !== 1) {
    console.error(`Se esperaba un colaborador y se encontraron ${colabs.length}.`)
    process.exit(1)
  }
  const c = colabs[0]

  const { rows: contratos } = await origen.query(
    `SELECT numero, tipo, estado, jornada, modalidad_trabajo, tipo_salario, salario_base,
            gana_salario_minimo, tiene_aux_transporte, aux_conectividad, fecha_inicio,
            fecha_fin, objeto_obra_labor, periodo_prueba_dias
     FROM contrato WHERE colaborador_id = $1 ORDER BY fecha_inicio`,
    [c.id],
  )
  console.log(`Origen: ingreso ${c.fecha_ingreso.toISOString().slice(0, 10)}, vínculo ${c.tipo_vinculo}, ${contratos.length} contrato(s)`)

  // Sede y cargo del destino: los ids de producción no existen en local.
  const { rows: sedes } = await destino.query('SELECT id FROM sede ORDER BY creado_en LIMIT 1')
  if (sedes.length === 0) {
    console.error('La base local no tiene sedes; corre el seed primero.')
    process.exit(1)
  }
  const sedeId = sedes[0].id

  const doc = String(Math.floor(Math.random() * 900_000_000) + 100_000_000)
  const nuevoId = randomUUID()
  await destino.query(
    `INSERT INTO colaborador (id, nombres, apellidos, tipo_documento, numero_documento, celular,
                              sede_id, tipo_vinculo, modalidad_trabajo, fecha_ingreso, estado,
                              busqueda_normalizada, creado_en, actualizado_en)
     VALUES ($1, 'CASO', 'DE PRUEBA', 'CC', $2, '3000000000', $3, $4, 'PRESENCIAL', $5, $6, $7, now(), now())`,
    [nuevoId, doc, sedeId, c.tipo_vinculo, c.fecha_ingreso, c.estado, `caso de prueba ${doc}`],
  )

  for (const [i, k] of contratos.entries()) {
    await destino.query(
      `INSERT INTO contrato (id, numero, colaborador_id, tipo, sede_id, jornada, modalidad_trabajo,
                             salario_base, gana_salario_minimo, tiene_aux_transporte, aux_conectividad,
                             tipo_salario, fecha_inicio, fecha_fin, objeto_obra_labor,
                             periodo_prueba_dias, estado, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())`,
      [
        randomUUID(), `${k.numero}-PRUEBA${i > 0 ? `-${i}` : ''}`, nuevoId, k.tipo, sedeId, k.jornada,
        k.modalidad_trabajo, k.salario_base, k.gana_salario_minimo, k.tiene_aux_transporte,
        k.aux_conectividad, k.tipo_salario, k.fecha_inicio, k.fecha_fin, k.objeto_obra_labor,
        k.periodo_prueba_dias, k.estado,
      ],
    )
    console.log(`  contrato ${k.numero} → ${k.tipo} ${k.estado}, salario ${k.salario_base}, ${k.fecha_inicio.toISOString().slice(0, 10)} → ${k.fecha_fin?.toISOString().slice(0, 10) ?? 'indefinido'}`)
  }

  console.log(`\nCreado en local: CASO DE PRUEBA (CC ${doc}). Registra su terminación para validar la liquidación.`)
  await origen.end()
  await destino.end()

}

main().catch((e) => { console.error(e); process.exitCode = 1 })

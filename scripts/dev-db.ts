/**
 * PostgreSQL embebido para desarrollo local (sin Docker ni instalación de sistema).
 * En producción la app se conecta a Supabase vía DATABASE_URL/DIRECT_URL.
 *
 * Uso: pnpm db:start   (dejar corriendo; Ctrl+C para detener)
 */
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), '.pgdata')
const PORT = 54322
const DB_NAME = 'gestor'

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
  // Paridad con Supabase (UTF8); ICU es-CO para ordenamiento correcto en español
  initdbFlags: ['--encoding=UTF8', '--locale-provider=icu', '--icu-locale=es-CO', '--locale=C'],
})

async function main() {
  const yaInicializada = existsSync(join(DATA_DIR, 'PG_VERSION'))
  if (!yaInicializada) {
    console.log('Inicializando datos de PostgreSQL embebido…')
    await pg.initialise()
  }
  await pg.start()
  if (!yaInicializada) {
    await pg.createDatabase(DB_NAME)
    console.log(`Base de datos "${DB_NAME}" creada.`)
  }
  console.log(`PostgreSQL embebido escuchando en localhost:${PORT} (base: ${DB_NAME}).`)
  console.log('Deja esta terminal abierta mientras desarrollas. Ctrl+C para detener.')
}

async function detener() {
  try {
    await pg.stop()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', detener)
process.on('SIGTERM', detener)

main().catch((err) => {
  console.error('Error iniciando PostgreSQL embebido:', err)
  process.exit(1)
})

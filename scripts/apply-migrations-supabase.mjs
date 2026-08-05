import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL_SUPABASE;
if (!url) throw new Error('DATABASE_URL_SUPABASE missing');

const dir = 'prisma/migrations';
const migrations = readdirSync(dir)
  .filter((f) => f !== 'migration_lock.toml')
  .sort();

const client = new Client({ connectionString: url });
await client.connect();
console.log('connected');

// Create Prisma migrations table
await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" varchar(36) PRIMARY KEY,
    "checksum" varchar(64) NOT NULL,
    "finished_at" timestamptz,
    "migration_name" varchar(255) NOT NULL,
    "logs" text,
    "rolled_back_at" timestamptz,
    "started_at" timestamptz NOT NULL DEFAULT now(),
    "applied_steps_count" integer NOT NULL DEFAULT 0
  );
`);

import { createHash, randomUUID } from 'node:crypto';

for (const name of migrations) {
  const sqlPath = join(dir, name, 'migration.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const already = await client.query(
    'SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL',
    [name],
  );
  if (already.rowCount) {
    console.log(`skip ${name}`);
    continue;
  }
  process.stdout.write(`apply ${name} ... `);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    const checksum = createHash('sha256').update(sql).digest('hex');
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), now(), 1)`,
      [randomUUID(), checksum, name],
    );
    await client.query('COMMIT');
    console.log('ok');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('FAIL', e.message);
    process.exit(1);
  }
}

await client.end();
console.log('done');

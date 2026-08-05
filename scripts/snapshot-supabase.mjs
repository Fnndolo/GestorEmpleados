import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

const url = process.env.DATABASE_URL_SUPABASE;
const client = new Client({ connectionString: url });
await client.connect();

const { rows: tables } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name <> '_prisma_migrations'
  ORDER BY table_name
`);

const snapshot = {};
for (const { table_name } of tables) {
  const pk = await client.query(`
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = ('public.' || $1)::regclass AND i.indisprimary
  `, [table_name]);
  const cols = pk.rows.map(r => `"${r.col}"`).join(',');
  if (!cols) { snapshot[table_name] = { pkCols: [], ids: [] }; continue; }
  const { rows } = await client.query(`SELECT ${cols} FROM public."${table_name}"`);
  snapshot[table_name] = { pkCols: pk.rows.map(r => r.col), ids: rows };
}

writeFileSync('scripts/supabase-snapshot.json', JSON.stringify(snapshot, null, 2));
const total = Object.values(snapshot).reduce((n, t) => n + t.ids.length, 0);
console.log(`snapshot saved: ${tables.length} tables, ${total} rows`);
await client.end();

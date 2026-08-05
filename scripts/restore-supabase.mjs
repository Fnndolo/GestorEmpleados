import { Client } from 'pg';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL_SUPABASE;
const snap = JSON.parse(readFileSync('scripts/supabase-snapshot.json', 'utf8'));
const client = new Client({ connectionString: url });
await client.connect();

await client.query('SET session_replication_role = replica'); // deshabilita FKs
let totalDel = 0;

for (const [table, info] of Object.entries(snap)) {
  const { pkCols, ids } = info;
  if (!pkCols.length) continue;
  if (ids.length === 0) {
    const { rowCount } = await client.query(`DELETE FROM public."${table}"`);
    if (rowCount) console.log(`  ${table}: -${rowCount}`);
    totalDel += rowCount;
    continue;
  }
  // Construir WHERE NOT IN por PK compuesta
  const cols = pkCols.map((c) => `"${c}"`).join(',');
  const values = ids
    .map((row, i) => `(${pkCols.map((c, j) => `$${i * pkCols.length + j + 1}`).join(',')})`)
    .join(',');
  const params = ids.flatMap((row) => pkCols.map((c) => row[c]));
  const { rowCount } = await client.query(
    `DELETE FROM public."${table}" WHERE (${cols}) NOT IN (${values})`,
    params,
  );
  if (rowCount) console.log(`  ${table}: -${rowCount}`);
  totalDel += rowCount;
}

await client.query('SET session_replication_role = DEFAULT');
console.log(`total borrado: ${totalDel} filas`);
await client.end();

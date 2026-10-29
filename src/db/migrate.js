import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const stmts = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await pool.raw.query(s);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await migrate();
  console.log('Migrasi selesai');
  await pool.end();
}

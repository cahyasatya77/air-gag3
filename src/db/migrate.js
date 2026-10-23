import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await migrate();
  console.log('Migrasi selesai');
  await pool.end();
}

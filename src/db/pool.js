import 'dotenv/config';
import mysql from 'mysql2/promise';

// Kolom berisi JSON (disimpan sebagai teks agar jalan di MySQL maupun MariaDB)
const JSON_COLS = new Set(['roles', 'before', 'after']);

const tz = process.env.DB_TIMEZONE || '+07:00';

const raw = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL/SUM -> number
  dateStrings: ['DATE'], // DATE -> 'YYYY-MM-DD'
  timezone: tz,
  flags: ['+FOUND_ROWS'], // rowCount = baris yang cocok, bukan hanya yang berubah
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const v = field.string();
      return v === null ? null : v === '1';
    }
    if (JSON_COLS.has(field.name)) {
      const v = field.string();
      if (v === null) return null;
      try { return JSON.parse(v); } catch { return v; }
    }
    return next();
  },
});
raw.on('connection', (c) => c.query(`SET time_zone='${tz}'`));

/**
 * Terjemahan ringan dari gaya PostgreSQL ($1, ::tipe, ANY, ON CONFLICT DO NOTHING) ke MySQL.
 * Parameter berulang ($1 dipakai dua kali) dipetakan ulang ke urutan '?'.
 */
function translate(text, params = []) {
  const out = [];
  let sql = text
    .replace(/::[a-z]+/gi, '')
    .replace(/<>\s*ALL\(\$(\d+)\)/gi, ' NOT IN ($$$1)')
    .replace(/=\s*ANY\(\$(\d+)\)/gi, ' IN ($$$1)')
    .replace(/\$(\d+)/g, (_, n) => { out.push(params[n - 1]); return '?'; });
  if (/ON CONFLICT(\s*\([^)]*\))?\s+DO NOTHING/i.test(sql)) {
    sql = sql.replace(/ON CONFLICT(\s*\([^)]*\))?\s+DO NOTHING/i, '').replace(/^(\s*)INSERT INTO/i, '$1INSERT IGNORE INTO');
  }
  return { sql, params: out };
}

const RETURNING = /\s+RETURNING\s+(.+?)\s*$/is;

/** Menjalankan satu query; hasilnya berbentuk { rows, rowCount } seperti pg. */
async function run(conn, text, params) {
  const t = translate(text, params);
  const m = t.sql.match(RETURNING);
  if (!m) {
    const [res] = await conn.query(t.sql, t.params);
    return Array.isArray(res) ? { rows: res, rowCount: res.length } : { rows: [], rowCount: res.affectedRows };
  }
  const cols = m[1];
  const sql = t.sql.replace(RETURNING, '');
  let mm;
  if ((mm = sql.match(/^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+(\w+)/i))) {
    const [res] = await conn.query(sql, t.params);
    if (!res.affectedRows) return { rows: [], rowCount: 0 };
    const [rows] = await conn.query(`SELECT ${cols} FROM ${mm[1]} WHERE id=?`, [res.insertId]);
    return { rows, rowCount: rows.length };
  }
  if ((mm = sql.match(/^\s*UPDATE\s+(\w+)\s+SET[\s\S]*\bWHERE\s+id=\?\s*$/i))) {
    // id adalah placeholder '?' ke-n pada query; cari nilainya dari urutan param
    const idx = (sql.match(/\?/g) || []).length - 1;
    const [res] = await conn.query(sql, t.params);
    if (!res.affectedRows) return { rows: [], rowCount: 0 };
    const [rows] = await conn.query(`SELECT ${cols} FROM ${mm[1]} WHERE id=?`, [t.params[idx]]);
    return { rows, rowCount: rows.length };
  }
  if ((mm = sql.match(/^\s*DELETE\s+FROM\s+(\w+)\s+(WHERE[\s\S]+)$/i))) {
    const [rows] = await conn.query(`SELECT ${cols} FROM ${mm[1]} ${mm[2]}`, t.params);
    if (rows.length) await conn.query(sql, t.params);
    return { rows, rowCount: rows.length };
  }
  throw new Error(`RETURNING tidak didukung untuk query ini: ${text.slice(0, 80)}`);
}

export const pool = {
  raw,
  query: (text, params) => run(raw, text, params),
  end: () => raw.end(),
};
export const query = (text, params) => run(raw, text, params);

export async function tx(fn) {
  const conn = await raw.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({ query: (text, params) => run(conn, text, params) });
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

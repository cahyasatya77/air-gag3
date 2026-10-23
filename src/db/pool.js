import 'dotenv/config';
import pg from 'pg';

// NUMERIC -> number, DATE -> 'YYYY-MM-DD' string
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

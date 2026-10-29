import { query } from '../db/pool.js';

/** Rekening bendahara yang berlaku (baris terbaru di bank_accounts). Null bila belum diisi. */
export async function bankInfo(db = { query }) {
  const { rows } = await db.query('SELECT bank, account_no, holder FROM bank_accounts ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

/** Berita transfer agar pembayaran mudah dicocokkan pengurus. */
export const transferNote = (b) => `Air ${b.no_rumah} ${b.period}`;

// Batasi pengelolaan ke blok Alamanda (A32-A87); rumah lain dinonaktifkan.
// A55, A56, A67 tidak memakai air perumahan (tagihan flat).
import { pool, tx } from './pool.js';

const FIRST = 32, LAST = 87, FLAT = ['A55', 'A56', 'A67'];
const DICOPOT = ['A60', 'A89']; // meteran dicopot, tidak membayar 3 bulan

await tx(async (db) => {
  await db.query(`UPDATE houses SET status='nonaktif' WHERE sort_no < $1 OR sort_no > $2`, [FIRST, LAST]);
  await db.query(`UPDATE houses SET status='normal' WHERE sort_no BETWEEN $1 AND $2 AND status='nonaktif'`, [FIRST, LAST]);
  await db.query(`UPDATE houses SET status='tidak_pakai' WHERE no_rumah = ANY($1)`, [FLAT]);
  await db.query(`UPDATE houses SET status='nonaktif' WHERE no_rumah = ANY($1)`, [DICOPOT]);
  await db.query(`UPDATE houses SET status='normal' WHERE sort_no BETWEEN $1 AND $2 AND status='tidak_pakai' AND no_rumah <> ALL($3)`, [FIRST, LAST, FLAT]);
  // buang tagihan kosong (belum dicatat) milik rumah nonaktif
  await db.query(`DELETE b FROM bills b JOIN houses h ON h.id=b.house_id WHERE h.status='nonaktif' AND b.recorded_at IS NULL AND b.meter_akhir IS NULL
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bill_id=b.id)`);
});
const { rows } = await pool.query('SELECT status, COUNT(*)::int n FROM houses GROUP BY status ORDER BY status');
console.log(rows);
await pool.end();

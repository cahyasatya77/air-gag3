// Impor riwayat meteran dari Excel sebagai tagihan lama berstatus lunas (tanpa mempengaruhi kas).
// Excel tidak mencatat pembayaran, jadi tunggakan nyata diinput terpisah (menu Tagihan Belum Lunas).
// Pemakaian: node src/db/import-history.js [path-excel] [rumah-awal] [rumah-akhir]
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { pool, tx } from './pool.js';
import { calcAmount, tariffFor, shiftPeriod } from '../services/billing.js';

const file = process.argv[2] || 'docs/Pencatatan Meteran Air GAG3.xlsx';
const FIRST = Number(process.argv[3] || 32), LAST = Number(process.argv[4] || 87);
const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const LAST_PERIOD = '2026-09'; // Oktober 2026 masih berjalan

// Sheet "Juni".."Desember" = 2025, "<Bulan> 2026" = 2026
const sheets = [];
let p = '2025-07'; // sheet Juni 2025 meter awalnya masih 0 (pemakaian kumulatif), dilewati
for (;;) {
  const [y, m] = p.split('-').map(Number);
  sheets.push({ period: p, name: y === 2025 ? BULAN[m - 1][0].toUpperCase() + BULAN[m - 1].slice(1) : `${BULAN[m - 1][0].toUpperCase()}${BULAN[m - 1].slice(1)} ${y}` });
  if (p === shiftPeriod(LAST_PERIOD, 1)) break;
  p = shiftPeriod(p, 1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const meters = new Map(); // period -> Map(no_rumah -> meter awal)
for (const s of sheets) {
  const ws = wb.getWorksheet(s.name);
  if (!ws) throw new Error(`Sheet "${s.name}" tidak ditemukan`);
  const m = new Map();
  ws.eachRow((row) => {
    const no = String(row.getCell(1).text).trim().toUpperCase();
    const v = row.getCell(3).value;
    const n = typeof v === 'number' ? v : (v !== null && v !== '' && !isNaN(Number(v)) ? Number(v) : null);
    if (/^A\d+$/.test(no) && n !== null) m.set(no, n);
  });
  meters.set(s.period, m);
}

const skipped = [];
let imported = 0;
await tx(async (db) => {
  const { rows: houses } = await db.query('SELECT id,no_rumah,status FROM houses WHERE sort_no BETWEEN $1 AND $2 ORDER BY sort_no', [FIRST, LAST]);
  for (const h of houses) {
    if (h.status === 'tidak_pakai') continue;
    for (const s of sheets.slice(0, -1)) {
      const awal = meters.get(s.period).get(h.no_rumah);
      const akhir = meters.get(shiftPeriod(s.period, 1)).get(h.no_rumah);
      if (awal == null || akhir == null) continue;
      if (akhir < awal) { skipped.push(`${h.no_rumah} ${s.period} (meter ${awal} -> ${akhir}, perlu justifikasi manual)`); continue; }
      const tariff = await tariffFor(db, s.period);
      const amount = calcAmount(akhir - awal, tariff);
      const b = await db.query(
        `INSERT INTO bills (house_id,period,meter_awal,meter_akhir,usage_m3,billed_m3,amount,tariff_id,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,now()) ON CONFLICT (house_id,period) DO NOTHING RETURNING id`,
        [h.id, s.period, awal, akhir, akhir - awal, amount, tariff.id]
      );
      if (!b.rowCount) continue;
      imported++;
      const paidAt = new Date(Date.UTC(+s.period.slice(0, 4), +s.period.slice(5), 0)).toISOString().slice(0, 10);
      await db.query(`INSERT INTO payments (bill_id,amount,paid_at,note) VALUES ($1,$2,$3,'Riwayat impor Excel (dianggap lunas)')`, [b.rows[0].id, amount, paidAt]);
    }
  }
  await db.query(`INSERT INTO audit_logs (username,action,entity,after) VALUES ('sistem','impor_riwayat','bill',$1)`, [JSON.stringify({ imported, skipped: skipped.length })]);
});
console.log(`${imported} tagihan riwayat diimpor (A${FIRST}-A${LAST}).`);
if (skipped.length) console.log('Dilewati:\n  ' + skipped.join('\n  '));
await pool.end();

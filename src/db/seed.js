// Seed awal: tarif, akun administrator, dan data rumah + meter awal dari Excel (sheet terbaru).
// Pemakaian: node src/db/seed.js [path-excel] [nama-sheet] [periode YYYY-MM]
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { pool, tx } from './pool.js';
import { migrate } from './migrate.js';

const file = process.argv[2] || 'docs/Pencatatan Meteran Air GAG3.xlsx';
const sheetName = process.argv[3] || 'Oktober 2026';
const period = process.argv[4] || '2026-10';

const clean = (s) => String(s ?? '').replace(/�/g, '-').replace(/\s+/g, ' ').trim();

await migrate();

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.getWorksheet(sheetName);
if (!ws) throw new Error(`Sheet "${sheetName}" tidak ditemukan`);

const houses = [];
ws.eachRow((row, n) => {
  const no = clean(row.getCell(1).text);
  if (n < 3 || !/^[A-Z]\d+$/i.test(no)) return;
  const meter = row.getCell(3).value;
  houses.push({
    no: no.toUpperCase(),
    owner: clean(row.getCell(2).text),
    meter: typeof meter === 'number' ? meter : null,
    note: clean(row.getCell(7).text),
  });
});

await tx(async (db) => {
  await db.query(
    `INSERT INTO tariffs (effective_from,abodemen_m3,abodemen_nominal,tambahan_per_m3,flat_nominal,kas_jimpitan) VALUES
     ('2020-01',15,15000,1000,10000,10000), ('2026-04',15,25000,1000,10000,10000) ON CONFLICT DO NOTHING`
  );

  const adminPw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');
  const r = await db.query(
    `INSERT INTO users (username,password_hash,name,roles) VALUES ('admin',$1,'Administrator',ARRAY['administrator'])
     ON CONFLICT (username) DO NOTHING`,
    [await bcrypt.hash(adminPw, 10)]
  );
  if (r.rowCount) console.log(`Akun admin dibuat -> username: admin, password: ${adminPw}  (segera ganti)`);

  for (const h of houses) {
    const sort = Number(h.no.replace(/\D/g, ''));
    const { rows } = await db.query(
      `INSERT INTO houses (no_rumah,sort_no,owner_name,notes) VALUES ($1,$2,$3,$4)
       ON CONFLICT (no_rumah) DO UPDATE SET owner_name=EXCLUDED.owner_name RETURNING id`,
      [h.no, sort, h.owner, h.note]
    );
    if (h.meter !== null) {
      await db.query(
        `INSERT INTO bills (house_id,period,meter_awal) VALUES ($1,$2,$3) ON CONFLICT (house_id,period) DO NOTHING`,
        [rows[0].id, period, h.meter]
      );
    }
  }
});

const noMeter = houses.filter((h) => h.meter === null).map((h) => h.no);
console.log(`${houses.length} rumah diimpor dari "${sheetName}", meter awal periode ${period} terisi untuk ${houses.length - noMeter.length}.`);
if (noMeter.length) console.log(`Tanpa meter awal (perlu dicek): ${noMeter.join(', ')}`);
await pool.end();

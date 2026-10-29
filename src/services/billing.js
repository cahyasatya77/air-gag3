export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const assertPeriod = (p) => {
  if (!PERIOD_RE.test(p || '')) throw new HttpError(400, 'Periode harus berformat YYYY-MM');
  return p;
};

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const periodLabel = (p) => `${BULAN[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;

export function shiftPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Nominal tagihan: abodemen sampai batas m3, lalu tambahan per m3 di atas batas. */
export function calcAmount(usage, tariff, flat = false) {
  if (flat) return tariff.flat_nominal;
  const over = Math.max(0, Math.ceil(usage) - tariff.abodemen_m3);
  return tariff.abodemen_nominal + over * tariff.tambahan_per_m3;
}

export async function tariffFor(db, period) {
  const { rows } = await db.query(
    'SELECT * FROM tariffs WHERE effective_from <= $1 ORDER BY effective_from DESC LIMIT 1',
    [period]
  );
  if (!rows[0]) throw new HttpError(409, `Belum ada tarif yang berlaku untuk periode ${period}`);
  return rows[0];
}

/** Meter awal periode = meter akhir periode sebelumnya (atau meter baru bila meteran diganti). */
async function carryOver(db, houseId, period) {
  const { rows } = await db.query(
    'SELECT meter_akhir, meter_awal_next FROM bills WHERE house_id=$1 AND period=$2',
    [houseId, shiftPeriod(period, -1)]
  );
  const prev = rows[0];
  if (!prev) return null;
  return prev.meter_awal_next ?? prev.meter_akhir;
}

/**
 * Buat periode baru (manual oleh pengurus): daftarkan periode lalu buat tagihan semua rumah aktif.
 * Periode pertama bebas dipilih; sesudahnya harus berurutan (bulan tepat setelah periode terbaru),
 * dan bulan-tahun yang sama tidak boleh dibuat dua kali.
 */
export async function createPeriod(db, period, userId) {
  assertPeriod(period);
  const { rows } = await db.query('SELECT period FROM periods ORDER BY period DESC');
  if (rows.some((r) => r.period === period)) throw new HttpError(409, `Periode ${periodLabel(period)} sudah dibuat`);
  if (rows.length) {
    const next = shiftPeriod(rows[0].period, 1);
    if (period !== next) throw new HttpError(409, `Periode harus berurutan: setelah ${periodLabel(rows[0].period)} berikutnya adalah ${periodLabel(next)}`);
  }
  const ins = await db.query('INSERT INTO periods (period, created_by) VALUES ($1,$2) ON CONFLICT DO NOTHING', [period, userId]);
  if (!ins.rowCount) throw new HttpError(409, 'Periode ini sudah dibuat');
  return generatePeriod(db, period);
}

/** Buat baris tagihan untuk semua rumah aktif pada satu periode (idempoten). */
export async function generatePeriod(db, period) {
  assertPeriod(period);
  const tariff = await tariffFor(db, period);
  const { rows: houses } = await db.query("SELECT * FROM houses WHERE status <> 'nonaktif'");
  let created = 0;
  for (const h of houses) {
    const flat = h.status === 'tidak_pakai';
    const awal = await carryOver(db, h.id, period);
    const r = await db.query(
      `INSERT INTO bills (house_id, period, meter_awal, flat, tariff_id, amount, billed_m3, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (house_id, period) DO NOTHING`,
      [h.id, period, awal, flat, tariff.id, flat ? tariff.flat_nominal : 0, flat ? 0 : null, flat ? new Date() : null]
    );
    created += r.rowCount;
  }
  await syncFlatBills(db, { period });
  return created;
}

/**
 * Samakan tagihan belum dibayar dengan status rumah: rumah "tidak_pakai" langsung ditagih flat
 * tanpa pencatatan meteran; rumah yang kembali normal dikembalikan ke tagihan berdasarkan meteran.
 * Tagihan yang sudah ada pembayaran tidak disentuh.
 */
export async function syncFlatBills(db, { period = null, houseId = null } = {}) {
  const { rows } = await db.query(
    `SELECT b.id, b.period, b.flat, b.amount, h.status FROM bills b JOIN houses h ON h.id=b.house_id
     WHERE h.status <> 'nonaktif' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bill_id=b.id)
       AND ($1::text IS NULL OR b.period=$1) AND ($2::int IS NULL OR b.house_id=$2)
       AND ((h.status='tidak_pakai') <> b.flat OR (h.status='tidak_pakai' AND (b.meter_akhir IS NOT NULL OR b.recorded_at IS NULL)))`,
    [period, houseId]
  );
  const tariffs = new Map();
  for (const b of rows) {
    if (b.status === 'tidak_pakai') {
      if (!tariffs.has(b.period)) tariffs.set(b.period, await tariffFor(db, b.period));
      const t = tariffs.get(b.period);
      await db.query(
        `UPDATE bills SET flat=TRUE, amount=$2, billed_m3=0, usage_m3=NULL, meter_akhir=NULL, meter_awal_next=NULL,
           tariff_id=$3, recorded_at=COALESCE(recorded_at, now()) WHERE id=$1`,
        [b.id, t.flat_nominal, t.id]
      );
      await db.query('DELETE FROM adjustments WHERE bill_id=$1', [b.id]);
    } else {
      await db.query(
        `UPDATE bills SET flat=FALSE, amount=0, billed_m3=NULL, usage_m3=NULL, meter_akhir=NULL, recorded_at=NULL WHERE id=$1`,
        [b.id]
      );
    }
  }
  return rows.length;
}

// Meter awal periode berikutnya ikut diperbarui bila periodenya sudah dibuat; periode tidak dibuat otomatis.
async function ensureNext(db, bill, awalNext) {
  await db.query(
    `UPDATE bills SET meter_awal=$3 WHERE house_id=$1 AND period=$2 AND meter_akhir IS NULL AND NOT flat`,
    [bill.house_id, shiftPeriod(bill.period, 1), awalNext]
  );
}

/** Catat meter akhir. Meter akhir < awal wajib lewat justifikasi (ganti/rusak). */
export async function recordReading(db, { billId, meterAkhir, userId, update = false }) {
  const { rows } = await db.query('SELECT * FROM bills WHERE id=$1 FOR UPDATE', [billId]);
  const bill = rows[0];
  if (!bill) throw new HttpError(404, 'Tagihan tidak ditemukan');
  if (bill.flat) throw new HttpError(409, 'Rumah ini bayar flat, tidak perlu pencatatan meteran');
  if (bill.meter_akhir !== null && !update) throw new HttpError(409, 'Meter akhir sudah diisi. Untuk mengubahnya gunakan tombol Update');
  if (!Number.isFinite(meterAkhir) || meterAkhir < 0) throw new HttpError(400, 'Meter akhir tidak valid');
  const paid = await paidSum(db, billId);
  if (paid > 0) throw new HttpError(409, 'Tagihan sudah ada pembayaran, tidak bisa diubah');
  let awal = bill.meter_awal;
  if (awal === null) awal = await carryOver(db, bill.house_id, bill.period);
  if (awal === null) throw new HttpError(409, 'Meter awal belum ada. Isi meter awal terlebih dahulu');
  const usage = meterAkhir - awal;
  if (usage < 0) {
    throw new HttpError(422, 'Meter akhir lebih kecil dari meter awal. Gunakan justifikasi (ganti/rusak meteran)');
  }
  const tariff = await tariffFor(db, bill.period);
  const amount = calcAmount(usage, tariff);
  const upd = await db.query(
    `UPDATE bills SET meter_awal=$2, meter_akhir=$3, usage_m3=$4, billed_m3=$4, amount=$5,
       tariff_id=$6, recorded_by=$7, recorded_at=now(), meter_awal_next=NULL WHERE id=$1 RETURNING *`,
    [billId, awal, meterAkhir, usage, amount, tariff.id, userId]
  );
  await db.query('DELETE FROM adjustments WHERE bill_id=$1', [billId]);
  await ensureNext(db, upd.rows[0], meterAkhir);
  return { before: bill, after: upd.rows[0] };
}

export async function setMeterAwal(db, { billId, meterAwal }) {
  const { rows } = await db.query('SELECT * FROM bills WHERE id=$1 FOR UPDATE', [billId]);
  const bill = rows[0];
  if (!bill) throw new HttpError(404, 'Tagihan tidak ditemukan');
  if (bill.meter_akhir !== null) throw new HttpError(409, 'Meter akhir sudah tercatat');
  if (!Number.isFinite(meterAwal) || meterAwal < 0) throw new HttpError(400, 'Meter awal tidak valid');
  const upd = await db.query('UPDATE bills SET meter_awal=$2 WHERE id=$1 RETURNING *', [billId, meterAwal]);
  return { before: bill, after: upd.rows[0] };
}

/** Justifikasi: ubah pemakaian/nominal tagihan dengan alasan tercatat. */
export async function applyAdjustment(db, { billId, type, overrideM3, overrideAmount, meterAwalNext, reason, userId }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'Alasan justifikasi wajib diisi');
  const { rows } = await db.query('SELECT * FROM bills WHERE id=$1 FOR UPDATE', [billId]);
  const bill = rows[0];
  if (!bill) throw new HttpError(404, 'Tagihan tidak ditemukan');
  if (bill.flat) throw new HttpError(409, 'Tagihan flat tidak bisa dijustifikasi pemakaiannya');
  if (overrideM3 == null && overrideAmount == null) {
    throw new HttpError(400, 'Isi pemakaian (m3) atau nominal pengganti');
  }
  if ((overrideM3 != null && overrideM3 < 0) || (overrideAmount != null && overrideAmount < 0)) {
    throw new HttpError(400, 'Nilai tidak boleh negatif');
  }
  const tariff = await tariffFor(db, bill.period);
  const billed = overrideM3 ?? bill.billed_m3 ?? 0;
  const amount = overrideAmount ?? calcAmount(billed, tariff);
  const paid = await paidSum(db, billId);
  if (paid > amount) throw new HttpError(409, 'Nominal baru lebih kecil dari yang sudah dibayar');
  await db.query(
    `INSERT INTO adjustments (bill_id,type,override_m3,override_amount,meter_awal_next,reason,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [billId, type, overrideM3 ?? null, overrideAmount ?? null, meterAwalNext ?? null, reason.trim(), userId]
  );
  const upd = await db.query(
    `UPDATE bills SET billed_m3=$2, amount=$3, tariff_id=$4,
       meter_awal_next=COALESCE($5, meter_awal_next), recorded_at=COALESCE(recorded_at, now()),
       recorded_by=COALESCE(recorded_by,$6) WHERE id=$1 RETURNING *`,
    [billId, billed, amount, tariff.id, meterAwalNext ?? null, userId]
  );
  if (meterAwalNext != null) await ensureNext(db, upd.rows[0], meterAwalNext);
  return { before: bill, after: upd.rows[0] };
}

export async function paidSum(db, billId) {
  const { rows } = await db.query('SELECT COALESCE(SUM(amount),0)::int AS s FROM payments WHERE bill_id=$1', [billId]);
  return rows[0].s;
}

/** Catat pembayaran dan bagi otomatis ke kas jimpitan (maks. kas_jimpitan per tagihan) & kas air. */
export async function recordPayment(db, { billId, amount, paidAt, note, method, userId }) {
  const { rows } = await db.query('SELECT * FROM bills WHERE id=$1 FOR UPDATE', [billId]);
  const bill = rows[0];
  if (!bill) throw new HttpError(404, 'Tagihan tidak ditemukan');
  if (!bill.recorded_at) throw new HttpError(409, 'Meteran bulan ini belum dicatat');
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'Nominal pembayaran tidak valid');
  const paid = await paidSum(db, billId);
  if (paid + amount > bill.amount) throw new HttpError(409, `Melebihi sisa tagihan (Rp ${bill.amount - paid})`);
  const tariff = bill.tariff_id
    ? (await db.query('SELECT * FROM tariffs WHERE id=$1', [bill.tariff_id])).rows[0]
    : await tariffFor(db, bill.period);
  const pay = (
    await db.query(
      `INSERT INTO payments (bill_id,amount,paid_at,note,method,received_by)
       VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6) RETURNING *`,
      [billId, amount, paidAt || null, note || '', method || 'tunai', userId]
    )
  ).rows[0];
  const jimpitanDone = Math.min(paid, tariff.kas_jimpitan);
  const jimpitan = Math.min(amount, tariff.kas_jimpitan - jimpitanDone);
  const air = amount - jimpitan;
  const label = `Pembayaran ${bill.period}`;
  for (const [fund, amt] of [['jimpitan', jimpitan], ['air', air]]) {
    if (amt > 0) {
      await db.query(
        `INSERT INTO cash_entries (fund,direction,amount,entry_date,category,description,payment_id,created_by)
         VALUES ($1,'in',$2,$3,'pembayaran',$4,$5,$6)`,
        [fund, amt, pay.paid_at, label, pay.id, userId]
      );
    }
  }
  return pay;
}

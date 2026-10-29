import { query, tx } from '../db/pool.js';
import { normalizePhone, buildMessage } from '../services/whatsapp.js';
import { bankInfo } from '../services/bank.js';
import { audit } from '../services/audit.js';
import { OPS_ROLES, PERIOD_ROLES, isOps } from '../services/roles.js';
import {
  HttpError, assertPeriod, createPeriod, generatePeriod, syncFlatBills, calcAmount, tariffFor, recordReading, setMeterAwal, applyAdjustment, recordPayment,
} from '../services/billing.js';

export const BILL_SELECT = `
  SELECT b.*, h.no_rumah, h.owner_name, h.status AS house_status, h.phone, h.user_id AS house_user_id,
    COALESCE(p.paid,0) AS paid, (b.amount - COALESCE(p.paid,0)) AS outstanding
  FROM bills b
  JOIN houses h ON h.id=b.house_id
  LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM payments GROUP BY bill_id) p ON p.bill_id=b.id`;

/** Tempelkan daftar justifikasi (adjustments) ke setiap tagihan hasil BILL_SELECT. */
export async function withAdjustments(rows) {
  if (!rows.length) return rows;
  const { rows: adj } = await query(
    `SELECT bill_id, type, override_m3, override_amount, reason, created_at FROM adjustments WHERE bill_id = ANY($1) ORDER BY id`,
    [rows.map((r) => r.id)]
  );
  return rows.map((r) => ({ ...r, adjustments: adj.filter((x) => x.bill_id === r.id).map(({ bill_id, ...x }) => x) }));
}

const num = { type: ['number'], minimum: 0 };

export default async function (app) {
  const staff = app.auth(...OPS_ROLES);

  // Periode yang sudah dibuat pengurus (terbaru di atas)
  app.get('/periods', { preHandler: staff }, async () => {
    const { rows } = await query('SELECT period FROM periods ORDER BY period DESC');
    return rows.map((r) => r.period);
  });

  // Daftar tagihan satu periode. Periode yang belum dibuat manual tidak berisi apa pun.
  app.get('/periods/:period/bills', { preHandler: staff }, async (req) => {
    const period = assertPeriod(req.params.period);
    const { rowCount } = await query('SELECT 1 FROM periods WHERE period=$1', [period]);
    if (!rowCount) return [];
    const { rows: [c] } = await query(
      `SELECT (SELECT COUNT(*) FROM houses WHERE status<>'nonaktif') AS houses,
              (SELECT COUNT(*) FROM bills b JOIN houses h ON h.id=b.house_id
                WHERE b.period=$1 AND h.status<>'nonaktif') AS bills`, [period]);
    if (Number(c.bills) < Number(c.houses)) await tx((db) => generatePeriod(db, period));
    else await tx((db) => syncFlatBills(db, { period }));
    const { rows } = await query(`${BILL_SELECT} WHERE b.period=$1 ORDER BY h.sort_no`, [period]);
    return withAdjustments(rows);
  });

  // Buat periode baru secara manual (tagihan dibuat untuk semua rumah aktif)
  app.post('/periods/:period/generate', { preHandler: app.auth(...PERIOD_ROLES) }, async (req, reply) => {
    const period = assertPeriod(req.params.period);
    const created = await tx((db) => createPeriod(db, period, req.user.id));
    await audit(req, 'buat_periode', 'period', period, null, { created });
    return reply.code(201).send({ period, created });
  });

  app.get('/bills/:id', { preHandler: app.auth() }, async (req) => {
    const bill = await loadBillFor(req, req.params.id);
    const payments = (await query('SELECT * FROM payments WHERE bill_id=$1 ORDER BY id', [bill.id])).rows;
    return { ...bill, payments };
  });

  app.put('/bills/:id/reading', {
    preHandler: staff,
    schema: { body: { type: 'object', required: ['meter_akhir'], properties: { meter_akhir: num, update: { type: 'boolean' } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    const r = await tx(async (db) => {
      const out = await recordReading(db, { billId: id, meterAkhir: req.body.meter_akhir, userId: req.user.id, update: req.body.update });
      await audit(req, out.before.meter_akhir !== null ? 'ubah_meter' : 'catat_meter', 'bill', id, pick(out.before), pick(out.after), db);
      return out.after;
    });
    return r;
  });

  app.put('/bills/:id/meter-awal', {
    preHandler: staff,
    schema: { body: { type: 'object', required: ['meter_awal'], properties: { meter_awal: num } } },
  }, async (req) => {
    const id = Number(req.params.id);
    return tx(async (db) => {
      const out = await setMeterAwal(db, { billId: id, meterAwal: req.body.meter_awal });
      await audit(req, 'ubah_meter_awal', 'bill', id, pick(out.before), pick(out.after), db);
      return out.after;
    });
  });

  app.post('/bills/:id/adjustments', {
    preHandler: staff,
    schema: {
      body: {
        type: 'object', required: ['type', 'reason'],
        properties: {
          type: { type: 'string', enum: ['meter_rusak', 'ganti_meteran', 'pemutusan', 'lainnya'] },
          override_m3: { type: ['number', 'null'] }, override_amount: { type: ['integer', 'null'] },
          meter_awal_next: { type: ['number', 'null'] }, reason: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const id = Number(req.params.id);
    const b = req.body;
    const out = await tx(async (db) => {
      const o = await applyAdjustment(db, {
        billId: id, type: b.type, overrideM3: b.override_m3, overrideAmount: b.override_amount,
        meterAwalNext: b.meter_awal_next, reason: b.reason, userId: req.user.id,
      });
      await audit(req, 'justifikasi', 'bill', id, pick(o.before), { ...pick(o.after), type: b.type, reason: b.reason }, db);
      return o.after;
    });
    return reply.code(201).send(out);
  });

  app.post('/bills/:id/payments', {
    preHandler: staff,
    schema: { body: { type: 'object', required: ['amount'], properties: { amount: { type: 'integer', minimum: 1 }, paid_at: { type: 'string', format: 'date' }, note: { type: 'string' }, method: { type: 'string', enum: ['tunai', 'transfer'] } } } },
  }, async (req, reply) => {
    const id = Number(req.params.id);
    const pay = await tx(async (db) => {
      const p = await recordPayment(db, { billId: id, amount: req.body.amount, paidAt: req.body.paid_at, note: req.body.note, method: req.body.method, userId: req.user.id });
      await audit(req, 'bayar', 'payment', p.id, null, p, db);
      return p;
    });
    return reply.code(201).send(pay);
  });

  // Batalkan pembayaran (salah klik): wajib alasan, kas ikut dikoreksi, tercatat di audit log
  app.post('/payments/:id/cancel', {
    preHandler: staff,
    schema: { body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3 } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    await tx(async (db) => {
      const { rows } = await db.query('DELETE FROM payments WHERE id=$1 RETURNING *', [id]);
      if (!rows[0]) throw new HttpError(404, 'Pembayaran tidak ditemukan');
      await audit(req, 'batal_bayar', 'payment', id, rows[0], { reason: req.body.reason.trim() }, db);
    });
    return { ok: true };
  });

  // Input tunggakan lama secara manual (administrator): isi nominal, atau meter awal + akhir
  app.post('/bills/arrears', {
    preHandler: app.auth('administrator'),
    schema: { body: { type: 'object', required: ['house_id', 'period', 'note'], properties: {
      house_id: { type: 'integer' }, period: { type: 'string' }, amount: { type: ['integer', 'null'], minimum: 1 },
      meter_awal: { type: ['number', 'null'], minimum: 0 }, meter_akhir: { type: ['number', 'null'], minimum: 0 }, note: { type: 'string', minLength: 1 } } } },
  }, async (req, reply) => {
    const b = req.body;
    assertPeriod(b.period);
    const hasMeter = b.meter_awal != null && b.meter_akhir != null;
    if (b.amount == null && !hasMeter) throw new HttpError(400, 'Isi nominal tunggakan, atau meter awal dan akhir');
    if (hasMeter && b.meter_akhir < b.meter_awal) throw new HttpError(400, 'Meter akhir lebih kecil dari meter awal');
    const bill = await tx(async (db) => {
      const tariff = await tariffFor(db, b.period);
      const usage = hasMeter ? b.meter_akhir - b.meter_awal : null;
      const amount = b.amount ?? calcAmount(usage, tariff);
      const ex = (await db.query('SELECT id, recorded_at FROM bills WHERE house_id=$1 AND period=$2 FOR UPDATE', [b.house_id, b.period])).rows[0];
      if (ex?.recorded_at) throw new HttpError(409, 'Tagihan periode ini sudah ada untuk rumah tersebut');
      const vals = [hasMeter ? b.meter_awal : null, hasMeter ? b.meter_akhir : null, usage, amount, tariff.id, req.user.id];
      const { rows } = ex
        ? await db.query(
          `UPDATE bills SET meter_awal=$2, meter_akhir=$3, usage_m3=$4, billed_m3=$4, amount=$5, tariff_id=$6, recorded_by=$7, recorded_at=now()
           WHERE id=$1 RETURNING *`, [ex.id, ...vals])
        : await db.query(
          `INSERT INTO bills (house_id,period,meter_awal,meter_akhir,usage_m3,billed_m3,amount,tariff_id,recorded_by,recorded_at)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,now()) RETURNING *`, [b.house_id, b.period, ...vals]);
      await db.query(`INSERT INTO adjustments (bill_id,type,override_amount,reason,created_by) VALUES ($1,'lainnya',$2,$3,$4)`,
        [rows[0].id, amount, `Tunggakan lama diinput manual: ${b.note.trim()}`, req.user.id]);
      await audit(req, 'tambah_tunggakan', 'bill', rows[0].id, null, { ...pick(rows[0]), note: b.note }, db);
      return rows[0];
    });
    return reply.code(201).send(bill);
  });

  // Tautan WhatsApp (wa.me) berisi pesan tagihan + link PDF bertanda tangan (berlaku 14 hari)
  app.post('/bills/:id/share', { preHandler: staff }, async (req) => {
    const bill = await loadBillFor(req, req.params.id);
    if (!bill.recorded_at) throw new HttpError(409, 'Meteran bulan ini belum dicatat');
    if (!normalizePhone(bill.phone)) throw new HttpError(409, `Nomor WhatsApp rumah ${bill.no_rumah} belum diisi (menu Data Rumah)`);
    const token = app.jwt.sign({ scope: 'invoice', bill: bill.id }, { expiresIn: '14d' });
    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.headers.host}`).replace(/[/]$/, '');
    const link = `${base}/api/share/invoice.pdf?t=${token}`;
    const message = buildMessage(bill, link, await bankInfo());
    await audit(req, 'kirim_wa', 'bill', bill.id, null, { rumah: bill.no_rumah, period: bill.period });
    return { wa_url: `https://wa.me/${normalizePhone(bill.phone)}?text=${encodeURIComponent(message)}`, message, link };
  });

  // Rekap piutang (tagihan belum lunas) per rumah: tagihan sudah tercatat (meteran diisi / flat / justifikasi) dan belum terbayar penuh,
  // pada periode mana pun yang sudah dibuat.
  app.get('/receivables', { preHandler: staff }, async () => {
    const { rows } = await query(
      `SELECT h.id AS house_id, h.no_rumah, h.owner_name, COUNT(*)::int AS jumlah_bulan,
         SUM(b.amount - COALESCE(p.paid,0))::int AS total, GROUP_CONCAT(b.period ORDER BY b.period) AS periods
       FROM bills b JOIN houses h ON h.id=b.house_id
       LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM payments GROUP BY bill_id) p ON p.bill_id=b.id
       WHERE b.recorded_at IS NOT NULL AND b.amount > COALESCE(p.paid,0)
       GROUP BY h.id ORDER BY h.sort_no`
    );
    return rows.map((r) => ({ ...r, periods: String(r.periods).split(',') }));
  });

  // Pemilik rumah: riwayat tagihan & pembayaran miliknya
  app.get('/my/bills', { preHandler: app.auth('pemilik') }, async (req) => {
    const rows = await withAdjustments((await query(
      `${BILL_SELECT} WHERE h.user_id=$1 AND b.recorded_at IS NOT NULL ORDER BY b.period DESC, h.sort_no`,
      [req.user.id]
    )).rows);
    const ids = rows.map((r) => r.id);
    const pays = ids.length ? (await query('SELECT * FROM payments WHERE bill_id=ANY($1) ORDER BY id', [ids])).rows : [];
    return rows.map((r) => ({ ...r, payments: pays.filter((p) => p.bill_id === r.id) }));
  });
}

const pick = (b) => b && ({
  meter_awal: b.meter_awal, meter_akhir: b.meter_akhir, usage_m3: b.usage_m3, billed_m3: b.billed_m3, amount: b.amount,
  period: b.period, house_id: b.house_id,
});

export async function loadBillFor(req, id) {
  const { rows } = await query(`${BILL_SELECT} WHERE b.id=$1`, [id]);
  const bill = (await withAdjustments(rows))[0];
  if (!bill) throw new HttpError(404, 'Tagihan tidak ditemukan');
  if (!isOps(req.user) &&bill.house_user_id !== req.user.id) throw new HttpError(403, 'Tidak punya akses');
  return bill;
}

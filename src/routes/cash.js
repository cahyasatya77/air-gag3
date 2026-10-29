import { query } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../services/billing.js';
import { OPS_ROLES, canAccessFund } from '../services/roles.js';

const FUNDS = ['jimpitan', 'air'];

export default async function (app) {
  const staff = app.auth(...OPS_ROLES);

  // Buku kas per dana, dengan saldo. Pengurus jimpitan/air hanya melihat dananya sendiri.
  app.get('/cash', { preHandler: staff }, async (req) => {
    const { fund, from, to } = req.query;
    const funds = FUNDS.filter((f) => canAccessFund(req.user, f));
    if (fund && !funds.includes(fund)) throw new HttpError(403, 'Tidak punya akses');
    const conds = [];
    const params = [];
    if (fund) { params.push(fund); conds.push(`fund=$${params.length}`); }
    else { params.push(funds); conds.push(`fund=ANY($${params.length})`); }
    if (from) { params.push(from); conds.push(`entry_date>=$${params.length}`); }
    if (to) { params.push(to); conds.push(`entry_date<=$${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT c.*, u.name AS created_by_name, h.no_rumah FROM cash_entries c LEFT JOIN users u ON u.id=c.created_by
       LEFT JOIN payments p ON p.id=c.payment_id LEFT JOIN bills b ON b.id=p.bill_id LEFT JOIN houses h ON h.id=b.house_id
       ${where} ORDER BY c.entry_date DESC, c.id DESC LIMIT 1000`, params
    );
    const bal = (await query(
      `SELECT fund, COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::int AS saldo,
         COALESCE(SUM(CASE WHEN direction='in' THEN amount END),0) AS masuk,
         COALESCE(SUM(CASE WHEN direction='out' THEN amount END),0) AS keluar
       FROM cash_entries GROUP BY fund`
    )).rows;
    return { entries: rows, saldo: Object.fromEntries(funds.map((f) => [f, bal.find((b) => b.fund === f) || { saldo: 0, masuk: 0, keluar: 0 }])) };
  });

  // Pengeluaran & pemasukan manual (donasi, bunga bank, dll.) terpisah per dana (jimpitan / pengelolaan air).
  // Pemasukan dari pembayaran tagihan tetap otomatis; yang ini tanpa payment_id.
  const entrySchema = { body: { type: 'object', required: ['fund', 'amount', 'description'], properties: { fund: { type: 'string', enum: FUNDS }, amount: { type: 'integer', minimum: 1 }, entry_date: { type: 'string', format: 'date' }, category: { type: 'string' }, description: { type: 'string', minLength: 1 } } } };

  const addEntry = (direction, action) => async (req, reply) => {
    const b = req.body;
    if (!canAccessFund(req.user, b.fund)) throw new HttpError(403, 'Tidak punya akses');
    const { rows } = await query(
      `INSERT INTO cash_entries (fund,direction,amount,entry_date,category,description,created_by)
       VALUES ($1,$2,$3,COALESCE($4::date,CURRENT_DATE),$5,$6,$7) RETURNING *`,
      [b.fund, direction, b.amount, b.entry_date || null, b.category || '', b.description.trim(), req.user.id]
    );
    await audit(req, action, 'cash_entry', rows[0].id, null, rows[0]);
    return reply.code(201).send(rows[0]);
  };
  app.post('/expenses', { preHandler: staff, schema: entrySchema }, addEntry('out', 'tambah_pengeluaran'));
  app.post('/incomes', { preHandler: staff, schema: entrySchema }, addEntry('in', 'tambah_pemasukan'));

  // Hapus catatan manual (pemasukan otomatis dari pembayaran dibatalkan lewat pembatalan pembayaran)
  app.delete('/cash-entries/:id', { preHandler: app.auth('administrator') }, async (req) => {
    const { rows } = await query('DELETE FROM cash_entries WHERE id=$1 AND payment_id IS NULL RETURNING *', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Catatan kas manual tidak ditemukan');
    await audit(req, rows[0].direction === 'in' ? 'hapus_pemasukan' : 'hapus_pengeluaran', 'cash_entry', rows[0].id, rows[0], null);
    return { ok: true };
  });
}

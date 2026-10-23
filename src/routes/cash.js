import { query } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../services/billing.js';

const FUNDS = ['jimpitan', 'air'];

export default async function (app) {
  const staff = app.auth('pengurus');

  // Buku kas per dana, dengan saldo
  app.get('/cash', { preHandler: staff }, async (req) => {
    const { fund, from, to } = req.query;
    const conds = [];
    const params = [];
    if (fund) { params.push(fund); conds.push(`fund=$${params.length}`); }
    if (from) { params.push(from); conds.push(`entry_date>=$${params.length}`); }
    if (to) { params.push(to); conds.push(`entry_date<=$${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT c.*, u.name AS created_by_name, h.no_rumah FROM cash_entries c LEFT JOIN users u ON u.id=c.created_by
       LEFT JOIN payments p ON p.id=c.payment_id LEFT JOIN bills b ON b.id=p.bill_id LEFT JOIN houses h ON h.id=b.house_id
       ${where} ORDER BY entry_date DESC, id DESC LIMIT 1000`, params
    );
    const bal = (await query(
      `SELECT fund, COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::int AS saldo,
         COALESCE(SUM(amount) FILTER (WHERE direction='in'),0)::int AS masuk,
         COALESCE(SUM(amount) FILTER (WHERE direction='out'),0)::int AS keluar
       FROM cash_entries GROUP BY fund`
    )).rows;
    return { entries: rows, saldo: Object.fromEntries(FUNDS.map((f) => [f, bal.find((b) => b.fund === f) || { saldo: 0, masuk: 0, keluar: 0 }])) };
  });

  // Pengeluaran terpisah per dana (jimpitan / pengelolaan air)
  app.post('/expenses', {
    preHandler: staff,
    schema: { body: { type: 'object', required: ['fund', 'amount', 'description'], properties: { fund: { type: 'string', enum: FUNDS }, amount: { type: 'integer', minimum: 1 }, entry_date: { type: 'string', format: 'date' }, category: { type: 'string' }, description: { type: 'string', minLength: 1 } } } },
  }, async (req, reply) => {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO cash_entries (fund,direction,amount,entry_date,category,description,created_by)
       VALUES ($1,'out',$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6) RETURNING *`,
      [b.fund, b.amount, b.entry_date || null, b.category || '', b.description.trim(), req.user.id]
    );
    await audit(req, 'tambah_pengeluaran', 'cash_entry', rows[0].id, null, rows[0]);
    return reply.code(201).send(rows[0]);
  });

  app.delete('/expenses/:id', { preHandler: app.auth('administrator') }, async (req) => {
    const { rows } = await query("DELETE FROM cash_entries WHERE id=$1 AND direction='out' RETURNING *", [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Pengeluaran tidak ditemukan');
    await audit(req, 'hapus_pengeluaran', 'cash_entry', rows[0].id, rows[0], null);
    return { ok: true };
  });
}

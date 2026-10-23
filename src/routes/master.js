import bcrypt from 'bcryptjs';
import { query, tx } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { HttpError, assertPeriod, syncFlatBills } from '../services/billing.js';

import { normalizePhone } from '../services/whatsapp.js';

function checkedPhone(raw) {
  if (!raw || !String(raw).trim()) return '';
  const p = normalizePhone(raw);
  if (!p) throw new HttpError(400, 'Nomor WhatsApp tidak valid (contoh: 081234567890)');
  return p;
}

const ROLES = ['administrator', 'pengurus', 'pemilik'];
const STATUSES = ['normal', 'tidak_pakai', 'nonaktif'];

export default async function (app) {
  const admin = app.auth('administrator');
  const staff = app.auth('pengurus');

  // ---- Rumah ----
  app.get('/houses', { preHandler: staff }, async () => {
    const { rows } = await query(
      `SELECT h.*, u.username AS user_username FROM houses h LEFT JOIN users u ON u.id=h.user_id ORDER BY h.sort_no`
    );
    return rows;
  });

  app.post('/houses', {
    preHandler: admin,
    schema: { body: { type: 'object', required: ['no_rumah'], properties: { no_rumah: { type: 'string', minLength: 1 }, owner_name: { type: 'string' }, status: { type: 'string', enum: STATUSES }, notes: { type: 'string' }, phone: { type: 'string' } } } },
  }, async (req, reply) => {
    const b = req.body;
    const no = b.no_rumah.trim().toUpperCase();
    const sort = Number(no.replace(/\D/g, '')) || 0;
    const { rows } = await query(
      `INSERT INTO houses (no_rumah,sort_no,owner_name,status,notes,phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [no, sort, b.owner_name || '', b.status || 'normal', b.notes || '', checkedPhone(b.phone)]
    );
    await audit(req, 'tambah', 'house', rows[0].id, null, rows[0]);
    return reply.code(201).send(rows[0]);
  });

  app.put('/houses/:id', {
    preHandler: admin,
    schema: { body: { type: 'object', properties: { owner_name: { type: 'string' }, status: { type: 'string', enum: STATUSES }, notes: { type: 'string' }, phone: { type: 'string' }, user_id: { type: ['integer', 'null'] } } } },
  }, async (req) => {
    const { id } = req.params;
    const before = (await query('SELECT * FROM houses WHERE id=$1', [id])).rows[0];
    if (!before) throw new HttpError(404, 'Rumah tidak ditemukan');
    const b = { ...before, ...req.body };
    const { rows } = await query(
      `UPDATE houses SET owner_name=$2,status=$3,notes=$4,user_id=$5,phone=$6 WHERE id=$1 RETURNING *`,
      [id, b.owner_name, b.status, b.notes, b.user_id, checkedPhone(b.phone)]
    );
    if (before.status !== rows[0].status) await tx((db) => syncFlatBills(db, { houseId: Number(id) }));
    await audit(req, 'ubah', 'house', id, before, rows[0]);
    return rows[0];
  });

  // ---- User ----
  app.get('/users', { preHandler: admin }, async () => {
    const { rows } = await query(
      `SELECT u.id,u.username,u.name,u.roles,u.active,
         COALESCE((SELECT array_agg(no_rumah ORDER BY sort_no) FROM houses WHERE user_id=u.id),'{}') AS houses
       FROM users u ORDER BY u.id`
    );
    return rows;
  });

  app.post('/users', {
    preHandler: admin,
    schema: { body: { type: 'object', required: ['username', 'password', 'name', 'roles'], properties: { username: { type: 'string', minLength: 3 }, password: { type: 'string', minLength: 8 }, name: { type: 'string', minLength: 1 }, roles: { type: 'array', items: { type: 'string', enum: ROLES }, minItems: 1, uniqueItems: true }, house_ids: { type: 'array', items: { type: 'integer' } } } } },
  }, async (req, reply) => {
    const b = req.body;
    const user = await tx(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO users (username,password_hash,name,roles) VALUES ($1,$2,$3,$4) RETURNING id,username,name,roles,active`,
        [b.username.trim(), await bcrypt.hash(b.password, 10), b.name.trim(), b.roles]
      );
      if (b.house_ids?.length) await db.query('UPDATE houses SET user_id=$1 WHERE id=ANY($2)', [rows[0].id, b.house_ids]);
      return rows[0];
    });
    await audit(req, 'tambah', 'user', user.id, null, { ...user, house_ids: b.house_ids });
    return reply.code(201).send(user);
  });

  app.put('/users/:id', {
    preHandler: admin,
    schema: { body: { type: 'object', properties: { name: { type: 'string' }, roles: { type: 'array', items: { type: 'string', enum: ROLES }, minItems: 1, uniqueItems: true }, active: { type: 'boolean' }, password: { type: 'string', minLength: 8 }, house_ids: { type: 'array', items: { type: 'integer' } } } } },
  }, async (req) => {
    const id = Number(req.params.id);
    const b = req.body;
    if (id === req.user.id && (b.active === false || (b.roles && !b.roles.includes('administrator')))) {
      throw new HttpError(409, 'Tidak bisa menonaktifkan/menurunkan akun sendiri');
    }
    const out = await tx(async (db) => {
      const before = (await db.query('SELECT id,username,name,roles,active FROM users WHERE id=$1', [id])).rows[0];
      if (!before) throw new HttpError(404, 'User tidak ditemukan');
      const n = { ...before, ...b };
      const { rows } = await db.query(
        `UPDATE users SET name=$2,roles=$3,active=$4 WHERE id=$1 RETURNING id,username,name,roles,active`,
        [id, n.name, n.roles, n.active]
      );
      if (b.password) await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, await bcrypt.hash(b.password, 10)]);
      if (b.house_ids) {
        await db.query('UPDATE houses SET user_id=NULL WHERE user_id=$1', [id]);
        if (b.house_ids.length) await db.query('UPDATE houses SET user_id=$1 WHERE id=ANY($2)', [id, b.house_ids]);
      }
      return { before, after: rows[0] };
    });
    await audit(req, b.password ? 'ubah_+reset_password' : 'ubah', 'user', id, out.before, out.after);
    return out.after;
  });

  // ---- Tarif (rumus penagihan) ----
  app.get('/tariffs', { preHandler: staff }, async () => (await query('SELECT * FROM tariffs ORDER BY effective_from DESC')).rows);

  app.post('/tariffs', {
    preHandler: admin,
    schema: { body: { type: 'object', required: ['effective_from', 'abodemen_m3', 'abodemen_nominal', 'tambahan_per_m3', 'flat_nominal', 'kas_jimpitan'], properties: { effective_from: { type: 'string' }, abodemen_m3: { type: 'integer', minimum: 0 }, abodemen_nominal: { type: 'integer', minimum: 0 }, tambahan_per_m3: { type: 'integer', minimum: 0 }, flat_nominal: { type: 'integer', minimum: 0 }, kas_jimpitan: { type: 'integer', minimum: 0 } } } },
  }, async (req, reply) => {
    const b = req.body;
    assertPeriod(b.effective_from);
    const { rows } = await query(
      `INSERT INTO tariffs (effective_from,abodemen_m3,abodemen_nominal,tambahan_per_m3,flat_nominal,kas_jimpitan,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.effective_from, b.abodemen_m3, b.abodemen_nominal, b.tambahan_per_m3, b.flat_nominal, b.kas_jimpitan, req.user.id]
    );
    await audit(req, 'tambah', 'tariff', rows[0].id, null, rows[0]);
    return reply.code(201).send(rows[0]);
  });

  // ---- Audit log ----
  app.get('/audit', { preHandler: admin }, async (req) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
}

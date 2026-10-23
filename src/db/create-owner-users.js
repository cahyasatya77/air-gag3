// Buat akun untuk rumah A31-A87 (username = nomor rumah huruf kecil), hubungkan ke rumahnya.
// Role pemilik; kecuali rumah di ADMIN_HOUSES = administrator.
// Pemakaian: node src/db/create-owner-users.js [password-default]
import bcrypt from 'bcryptjs';
import { pool, tx } from './pool.js';

const FIRST = 31, LAST = 87, ADMIN_HOUSES = ['A54'];
const password = process.argv[2] || '12345678';
const hash = await bcrypt.hash(password, 10);

const out = await tx(async (db) => {
  const { rows: houses } = await db.query('SELECT id,no_rumah,owner_name FROM houses WHERE sort_no BETWEEN $1 AND $2 AND user_id IS NULL ORDER BY sort_no', [FIRST, LAST]);
  const made = [];
  for (const h of houses) {
    const roles = ADMIN_HOUSES.includes(h.no_rumah) ? ['administrator', 'pengurus', 'pemilik'] : ['pemilik'];
    const u = await db.query(
      `INSERT INTO users (username,password_hash,name,roles) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING RETURNING id`,
      [h.no_rumah.toLowerCase(), hash, h.owner_name || h.no_rumah, roles]
    );
    if (!u.rowCount) continue;
    await db.query('UPDATE houses SET user_id=$1 WHERE id=$2', [u.rows[0].id, h.id]);
    made.push({ no: h.no_rumah, roles });
  }
  await db.query(`INSERT INTO audit_logs (username,action,entity,after) VALUES ('sistem','buat_akun_massal','user',$1)`, [JSON.stringify({ jumlah: made.length })]);
  return made;
});
console.log(`${out.length} akun dibuat. Administrator: ${out.filter((m) => m.roles.includes('administrator')).map((m) => m.no).join(', ') || '-'}`);
await pool.end();

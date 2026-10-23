import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { audit } from '../services/audit.js';

export default async function (app) {
  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } },
  }, async (req, reply) => {
    const { username, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE username=$1 AND active', [username.trim()]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      await audit({ ip: req.ip, user: { username } }, 'login_gagal', 'user', null, null, null);
      return reply.code(401).send({ error: 'Username atau password salah' });
    }
    const payload = { id: u.id, username: u.username, name: u.name, roles: u.roles };
    const token = await reply.jwtSign(payload);
    reply.setCookie('token', token, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 12 * 3600 });
    req.user = payload;
    await audit(req, 'login', 'user', u.id, null, null);
    return payload;
  });

  app.post('/auth/logout', async (req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.auth() }, async (req) => req.user);

  app.post('/me/password', {
    preHandler: app.auth(),
    schema: { body: { type: 'object', required: ['old_password', 'new_password'], properties: { old_password: { type: 'string' }, new_password: { type: 'string', minLength: 8 } } } },
  }, async (req, reply) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await bcrypt.compare(req.body.old_password, rows[0].password_hash))) {
      return reply.code(400).send({ error: 'Password lama salah' });
    }
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await bcrypt.hash(req.body.new_password, 10)]);
    await audit(req, 'ubah_password', 'user', req.user.id, null, null);
    return { ok: true };
  });
}

import 'dotenv/config';
import Fastify from 'fastify';
import fstatic from '@fastify/static';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './services/billing.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/master.js';
import billingRoutes from './routes/billing.js';
import cashRoutes from './routes/cash.js';
import reportRoutes from './routes/reports.js';

export async function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET belum diset di .env');

  await app.register(cookie);
  await app.register(jwt, { secret, cookie: { cookieName: 'token', signed: false }, sign: { expiresIn: '12h' } });
  await app.register(rateLimit, { global: false });

  app.decorate('auth', (...roles) => async (req, reply) => {
    try {
      await req.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.code(401).send({ error: 'Silakan login terlebih dahulu' });
    }
    if (!Array.isArray(req.user.roles)) return reply.code(401).send({ error: 'Sesi tidak valid, silakan login ulang' });
    // administrator melihat semua menu; peran lain harus cocok dengan salah satu peran yang diizinkan
    if (roles.length && !req.user.roles.includes('administrator') && !roles.some((r) => req.user.roles.includes(r))) {
      return reply.code(403).send({ error: 'Tidak punya akses' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if (err.code === '23505') return reply.code(409).send({ error: 'Data sudah ada (duplikat)' });
    if (err.validation || err.statusCode < 500) return reply.code(err.statusCode || 400).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Terjadi kesalahan pada server' });
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(masterRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(cashRoutes, { prefix: '/api' });
  await app.register(reportRoutes, { prefix: '/api' });

  // Frontend (Vue) hasil build: frontend/dist. Rute non-API dikembalikan ke index.html (SPA).
  const root = fileURLToPath(new URL('../frontend/dist', import.meta.url));
  if (existsSync(root)) {
    await app.register(fstatic, { root });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Tidak ditemukan' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

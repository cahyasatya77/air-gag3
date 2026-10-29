import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'mysql://root:@localhost:3306/pencatatan_air_test';
process.env.JWT_SECRET = 'test-secret';

const { calcAmount } = await import('../src/services/billing.js');
const { pool } = await import('../src/db/pool.js');
const { migrate } = await import('../src/db/migrate.js');
const { buildApp } = await import('../src/app.js');
const bcrypt = (await import('bcryptjs')).default;

const T = { abodemen_m3: 15, abodemen_nominal: 25000, tambahan_per_m3: 1000, flat_nominal: 10000, kas_jimpitan: 10000 };

test('rumus tagihan', () => {
  assert.equal(calcAmount(0, T), 25000);
  assert.equal(calcAmount(15, T), 25000);
  assert.equal(calcAmount(16, T), 26000);
  assert.equal(calcAmount(30, T), 40000);
  assert.equal(calcAmount(99, T, true), 10000);
});

test('alur pencatatan, justifikasi, pembayaran, kas', async (t) => {
  await migrate();
  const c = await pool.raw.getConnection();
  await c.query('SET FOREIGN_KEY_CHECKS=0');
  for (const tb of ['users', 'houses', 'periods', 'tariffs', 'bills', 'adjustments', 'payments', 'cash_entries', 'audit_logs', 'bank_accounts', 'meeting_note_points', 'meeting_notes']) await c.query(`TRUNCATE ${tb}`);
  await c.query('SET FOREIGN_KEY_CHECKS=1');
  c.release();
  const hash = await bcrypt.hash('password123', 4);
  await pool.query(
    `INSERT INTO users (username,password_hash,name,roles) VALUES ('adm',$1,'Adm','["administrator"]'),('pgs',$1,'Pgs','["pengurus"]'),('own',$1,'Own','["pemilik"]')`, [hash]);
  await pool.query(`INSERT INTO tariffs (effective_from,abodemen_m3,abodemen_nominal,tambahan_per_m3,flat_nominal,kas_jimpitan) VALUES ('2026-01',15,25000,1000,10000,10000)`);
  await pool.query(`INSERT INTO houses (no_rumah,sort_no,owner_name,status,user_id) VALUES ('A1',1,'Budi','normal',3),('A2',2,'Siti','tidak_pakai',NULL),('A3',3,'Ani','normal',NULL)`);
  await pool.query(`INSERT INTO bills (house_id,period,meter_awal) VALUES (1,'2026-10',100),(3,'2026-10',50),(2,'2026-10',5)`); // A2 flat tapi tagihannya sempat dibuat sebagai meteran

  const app = await buildApp();
  t.after(async () => { await app.close(); await pool.end(); });

  const login = async (username) => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'password123' } });
    assert.equal(r.statusCode, 200);
    return { cookie: `token=${r.cookies[0].value}` };
  };
  const as = (h) => (method, url, payload) => app.inject({ method, url, payload, headers: h });
  const pgs = as(await login('pgs'));
  const own = as(await login('own'));

  assert.equal((await app.inject({ method: 'GET', url: '/api/houses' })).statusCode, 401);
  assert.equal((await own('GET', '/api/houses')).statusCode, 403);
  assert.equal((await pgs('GET', '/api/users')).statusCode, 403);

  // periode dibuat manual: sebelum dibuat tidak ada tagihan & tidak terbuat otomatis
  assert.deepEqual((await pgs('GET', '/api/periods/2026-10/bills')).json(), []);
  assert.deepEqual((await pgs('GET', '/api/periods')).json(), []);
  assert.equal((await own('POST', '/api/periods/2026-10/generate')).statusCode, 403);
  await pool.query(`INSERT INTO users (username,password_hash,name,roles) VALUES ('pjtest',$1,'PJ','["pengurus_jimpitan"]')`, [hash]);
  const pjt = as(await login('pjtest'));
  assert.equal((await pjt('POST', '/api/periods/2026-10/generate')).statusCode, 403); // pengurus jimpitan tidak boleh
  assert.equal((await pgs('POST', '/api/periods/2026-10/generate')).statusCode, 201);
  assert.equal((await pgs('POST', '/api/periods/2026-10/generate')).statusCode, 409); // bulan-tahun sama
  assert.equal((await pgs('POST', '/api/periods/2026-12/generate')).statusCode, 409); // melompat, harus urut
  assert.equal((await pgs('POST', '/api/periods/2026-09/generate')).statusCode, 409); // mundur
  assert.deepEqual((await pgs('GET', '/api/periods')).json(), ['2026-10']);

  // rumah flat otomatis ditagih 10.000
  const bills = (await pgs('GET', '/api/periods/2026-10/bills')).json();
  const b = (no) => bills.find((x) => x.no_rumah === no);
  assert.equal(b('A2').amount, 10000);

  // catat meter: 100 -> 120 = 20 m3 => 25.000 + 5.000
  let r = await pgs('PUT', `/api/bills/${b('A1').id}/reading`, { meter_akhir: 120 });
  // sudah terisi: tidak bisa ditimpa langsung, harus lewat update (konfirmasi di UI)
  assert.equal((await pgs('PUT', `/api/bills/${b('A1').id}/reading`, { meter_akhir: 130 })).statusCode, 409);
  assert.equal((await pgs('PUT', `/api/bills/${b('A1').id}/reading`, { meter_akhir: 130, update: true })).statusCode, 200);
  r = await pgs('PUT', `/api/bills/${b('A1').id}/reading`, { meter_akhir: 120, update: true });
  assert.equal(r.json().amount, 30000);
  // periode berikutnya tidak terbentuk otomatis; setelah dibuat, meter awal = meter akhir
  assert.deepEqual((await pgs('GET', '/api/periods/2026-11/bills')).json(), []);
  assert.equal((await pgs('POST', '/api/periods/2026-11/generate')).statusCode, 201);
  const nov = (await pgs('GET', '/api/periods/2026-11/bills')).json();
  assert.equal(nov.find((x) => x.no_rumah === 'A1').meter_awal, 120);

  // meter akhir lebih kecil wajib justifikasi
  r = await pgs('PUT', `/api/bills/${b('A3').id}/reading`, { meter_akhir: 10 });
  assert.equal(r.statusCode, 422);
  r = await pgs('POST', `/api/bills/${b('A3').id}/adjustments`, {
    type: 'ganti_meteran', override_m3: 8, meter_awal_next: 10, reason: 'Meteran diganti baru',
  });
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().amount, 25000);
  const nov2 = (await pgs('GET', '/api/periods/2026-11/bills')).json();
  assert.equal(nov2.find((x) => x.no_rumah === 'A3').meter_awal, 10);

  // pembayaran dibagi: 10.000 jimpitan, sisanya air
  r = await pgs('POST', `/api/bills/${b('A1').id}/payments`, { amount: 30000 });
  assert.equal(r.statusCode, 201);
  r = await pgs('POST', `/api/bills/${b('A2').id}/payments`, { amount: 10000 });
  assert.equal(r.statusCode, 201);
  r = await pgs('POST', `/api/bills/${b('A1').id}/payments`, { amount: 1 });
  assert.equal(r.statusCode, 409); // melebihi tagihan

  r = (await pgs('GET', '/api/cash')).json();
  assert.equal(r.saldo.jimpitan.saldo, 20000);
  assert.equal(r.saldo.air.saldo, 20000);

  r = await pgs('POST', '/api/expenses', { fund: 'air', amount: 5000, description: 'Beli pipa' });
  assert.equal(r.statusCode, 201);
  assert.equal((await pgs('GET', '/api/cash')).json().saldo.air.saldo, 15000);

  // pemilik hanya melihat tagihan rumahnya
  const mine = (await own('GET', '/api/my/bills')).json();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].payments.length, 1);
  assert.equal((await own('GET', `/api/bills/${b('A3').id}`)).statusCode, 403);

  // audit log tercatat
  const { rows } = await pool.query("SELECT action FROM audit_logs WHERE action IN ('catat_meter','justifikasi','bayar')");
  assert.ok(rows.length >= 4);

  // tunggakan lama manual (admin saja)
  const adm = as(await login('adm'));
  r = await pgs('POST', '/api/bills/arrears', { house_id: 3, period: '2026-07', amount: 25000, note: 'x' });
  assert.equal(r.statusCode, 403);
  r = await adm('POST', '/api/bills/arrears', { house_id: 3, period: '2026-07', amount: 25000, note: 'Belum bayar Juli' });
  assert.equal(r.statusCode, 201);
  r = await adm('POST', '/api/bills/arrears', { house_id: 3, period: '2026-07', amount: 25000, note: 'dobel' });
  assert.equal(r.statusCode, 409);
  const rec = (await pgs('GET', '/api/receivables')).json();
  assert.ok(rec.find((x) => x.no_rumah === 'A3' && x.periods.includes('2026-07')));

  // WhatsApp: nomor kosong ditolak, lalu link bertanda tangan bisa dibuka tanpa login
  r = await pgs('POST', `/api/bills/${b('A1').id}/share`);
  assert.equal(r.statusCode, 409);
  r = await adm('PUT', '/api/houses/1', { phone: '0812-3456-7890' });
  assert.equal(r.json().phone, '6281234567890');
  r = await adm('PUT', '/api/houses/1', { phone: '123' });
  assert.equal(r.statusCode, 400);
  r = await pgs('POST', `/api/bills/${b('A1').id}/share`);
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().wa_url.startsWith("https://wa.me/6281234567890?text="));
  const u = new URL(r.json().link);
  const path = u.pathname + u.search;
  r = await app.inject({ method: 'GET', url: path });
  assert.equal(r.statusCode, 200);
  assert.equal(r.rawPayload.subarray(0, 4).toString(), '%PDF');
  assert.equal((await app.inject({ method: 'GET', url: path + 'x' })).statusCode, 403);

  // batalkan pembayaran: kas dikoreksi, alasan wajib
  const payId = (await pgs('GET', `/api/bills/${b('A1').id}`)).json().payments[0].id;
  assert.equal((await pgs('POST', `/api/payments/${payId}/cancel`, {})).statusCode, 400);
  assert.equal((await pgs('POST', `/api/payments/${payId}/cancel`, { reason: 'Salah klik' })).statusCode, 200);
  assert.equal((await pgs('GET', '/api/cash')).json().saldo.jimpitan.saldo, 10000);
  assert.equal((await pgs('GET', `/api/bills/${b('A1').id}`)).json().outstanding, 30000);

  // laporan kas per dana: dapat dibaca pemilik, kas masuk tanpa nama rumah, pengeluaran dirinci
  r = await own('GET', '/api/reports/kas/air?year=' + new Date().getFullYear());
  assert.equal(r.statusCode, 200);
  const rep = r.json();
  const cur = rep.months.find((m) => m.expenses.length);
  assert.equal(cur.expenses[0].description, 'Beli pipa');
  assert.equal(cur.keluar, 5000);
  assert.ok(!JSON.stringify(rep).includes('A1'));
  assert.equal((await app.inject({ method: 'GET', url: '/api/reports/kas/air' })).statusCode, 401);

  // satu pengguna banyak peran
  assert.equal((await adm('PUT', '/api/users/2', { roles: [] })).statusCode, 400);
  assert.equal((await adm('PUT', '/api/users/2', { roles: ['pengurus', 'pemilik'] })).statusCode, 200);
  const multi = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'pgs', password: 'password123' } });
  assert.deepEqual(multi.json().roles, ['pengurus', 'pemilik']);
  const m = as({ cookie: `token=${multi.cookies[0].value}` });
  assert.equal((await m('GET', '/api/my/bills')).statusCode, 200); // peran pemilik
  assert.equal((await m('GET', '/api/receivables')).statusCode, 200); // peran pengurus
  assert.equal((await m('GET', '/api/users')).statusCode, 403); // bukan administrator

  // pengurus jimpitan / air: pencatatan & tagihan + kas dananya saja
  assert.equal((await adm('POST', '/api/users', { username: 'pjimpitan', password: 'password123', name: 'PJ', roles: ['pengurus_jimpitan'] })).statusCode, 201);
  assert.equal((await adm('POST', '/api/users', { username: 'pair', password: 'password123', name: 'PA', roles: ['pengurus_air'] })).statusCode, 201);
  const pj = as(await login('pjimpitan'));
  const pa = as(await login('pair'));
  for (const u of [pj, pa]) {
    assert.equal((await u('GET', '/api/periods/2026-10/bills')).statusCode, 200);
    assert.equal((await u('GET', '/api/receivables')).statusCode, 200);
    assert.equal((await u('GET', '/api/users')).statusCode, 403);
  }
  assert.equal((await pj('GET', '/api/cash?fund=jimpitan')).statusCode, 200);
  assert.equal((await pj('GET', '/api/cash?fund=air')).statusCode, 403);
  assert.deepEqual(Object.keys((await pj('GET', '/api/cash')).json().saldo), ['jimpitan']);
  assert.deepEqual(Object.keys((await pa('GET', '/api/cash')).json().saldo), ['air']);
  assert.equal((await pj('POST', '/api/expenses', { fund: 'jimpitan', amount: 1000, description: 'x' })).statusCode, 201);
  assert.equal((await pj('POST', '/api/expenses', { fund: 'air', amount: 1000, description: 'x' })).statusCode, 403);
  assert.equal((await pa('POST', '/api/expenses', { fund: 'air', amount: 1000, description: 'x' })).statusCode, 201);
  // pemasukan manual dari sumber lain
  assert.equal((await pj('POST', '/api/incomes', { fund: 'air', amount: 1000, description: 'x' })).statusCode, 403);
  const inc = await pa('POST', '/api/incomes', { fund: 'air', amount: 7000, category: 'Donasi', description: 'Donasi warga' });
  assert.equal(inc.statusCode, 201);
  assert.equal(inc.json().direction, 'in');
  assert.equal(inc.json().payment_id, null);
  const incRep = (await pa('GET', '/api/reports/kas/air')).json().months.find((m) => m.incomes.length);
  assert.equal(incRep.incomes[0].description, 'Donasi warga');
  assert.equal(incRep.masuk_lain, 7000);
  assert.equal(incRep.masuk, incRep.masuk_pembayaran + 7000);
  assert.equal((await adm('DELETE', `/api/cash-entries/${inc.json().id}`)).statusCode, 200);
  assert.equal((await adm('DELETE', `/api/cash-entries/${inc.json().id}`)).statusCode, 404);

  // notulen: admin & pengurus menulis, semua pengguna login membaca, HTML disanitasi
  const note = { title: 'Notulensi 24/10/2026', meeting_date: '2026-10-24', location: 'Fasum', points: [
    { title: 'Retribusi air', content: '<ul><li>Normal meteran</li></ul><script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">klik</a>' },
    { title: 'Struktur organisasi', content: '<p><strong>Ketua</strong>: Cahya</p>' }] };
  assert.equal((await own('POST', '/api/notes', note)).statusCode, 403);
  assert.equal((await pj('POST', '/api/notes', note)).statusCode, 403);
  assert.equal((await pgs('POST', '/api/notes', { ...note, points: [] })).statusCode, 400);
  r = await pgs('POST', '/api/notes', note);
  assert.equal(r.statusCode, 201);
  const nid = r.json().id;
  assert.equal(r.json().points.length, 2);
  assert.ok(!/script|javascript|onclick/i.test(r.json().points[0].content));
  assert.match(r.json().points[0].content, /<li>Normal meteran<\/li>/);
  assert.equal((await own('GET', '/api/notes')).json()[0].point_count, 2);
  assert.equal((await own('GET', `/api/notes/${nid}`)).json().points[1].title, 'Struktur organisasi');
  assert.equal((await own('GET', '/api/notes/9999')).statusCode, 404);
  r = await adm('PUT', `/api/notes/${nid}`, { ...note, points: [note.points[1]] });
  assert.equal(r.json().points.length, 1);
  assert.equal((await pgs('DELETE', `/api/notes/${nid}`)).statusCode, 403);
  assert.equal((await adm('DELETE', `/api/notes/${nid}`)).statusCode, 200);
  assert.deepEqual((await own('GET', '/api/notes')).json(), []);

  // PDF
  r = await pgs('GET', '/api/periods/2026-10/report.pdf');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /pdf/);
  assert.equal(r.rawPayload.subarray(0, 4).toString(), '%PDF');
});

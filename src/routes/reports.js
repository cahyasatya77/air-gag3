import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { assertPeriod, periodLabel } from '../services/billing.js';
import { bankInfo, transferNote } from '../services/bank.js';
import { OPS_ROLES } from '../services/roles.js';
import { BILL_SELECT, loadBillFor, withAdjustments } from './billing.js';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export { periodLabel };
export const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');

function pdfReply(reply, filename, build) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `inline; filename="${filename}"`);
  build(doc);
  doc.end();
  return reply.send(doc);
}

function table(doc, cols, rows, { rowH = 16 } = {}) {
  const x0 = doc.page.margins.left;
  const drawRow = (cells, bold) => {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawRow(cols.map((c) => c.title), true);
    }
    let x = x0;
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cells.forEach((v, i) => {
      doc.text(String(v ?? ''), x + 2, y + 3, { width: cols[i].w - 4, align: cols[i].align || 'left', lineBreak: false, ellipsis: true });
      x += cols[i].w;
    });
    doc.moveTo(x0, y + rowH).lineTo(x, y + rowH).strokeColor('#cccccc').stroke();
    doc.y = y + rowH;
  };
  drawRow(cols.map((c) => c.title), true);
  rows.forEach((r) => drawRow(r, false));
}

const LOGO = fileURLToPath(new URL('../assets/logo.png', import.meta.url));
const C = { green: '#1f5c2e', soft: '#eef5ee', line: '#d5ddd5', text: '#1f2a21', mute: '#6b776d', red: '#b3261e', amber: '#b26a00' };
const METODE = { tunai: 'Tunai (Cash)', transfer: 'Transfer (TF)' };
const TGL = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

export async function invoicePdf(reply, b, payments) {
  const { rows: [t] } = await query(
    b.tariff_id ? 'SELECT * FROM tariffs WHERE id=$1' : 'SELECT * FROM tariffs ORDER BY effective_from DESC LIMIT 1',
    b.tariff_id ? [b.tariff_id] : []);
  const bank = b.outstanding > 0 ? await bankInfo() : null;
  return pdfReply(reply, `kwitansi-${b.no_rumah}-${b.period}.pdf`, (doc) => {
    const L = doc.page.margins.left;
    const W = doc.page.width - L * 2;
    const R = L + W;
    const lunas = b.outstanding <= 0 && b.amount > 0;
    const status = lunas ? { txt: 'LUNAS', col: C.green }
      : b.paid > 0 ? { txt: 'BELUM LUNAS (SEBAGIAN)', col: C.amber } : { txt: 'BELUM LUNAS', col: C.red };

    // Kop surat
    doc.image(LOGO, L, 36, { width: 70 });
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(20).text('GANG ALAMANDA', L + 84, 44, { width: W - 84 });
    doc.fillColor(C.text).fontSize(11).text('GRIYA ASRI GADINGAN 3', L + 84, 68);
    doc.fillColor(C.mute).font('Helvetica').fontSize(8.5).text('Ds. Gadingan, Kec. Mojolaban, Kab. Sukoharjo 57554', L + 84, 84);
    doc.moveTo(L, 116).lineTo(R, 116).lineWidth(2.5).strokeColor(C.green).stroke();
    doc.moveTo(L, 120).lineTo(R, 120).lineWidth(0.6).strokeColor(C.green).stroke();

    // Judul + stempel status
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(16).text('KWITANSI PEMBAYARAN AIR', L, 138);
    doc.fillColor(C.mute).font('Helvetica').fontSize(10).text(`Periode ${periodLabel(b.period)}`, L, 158);
    const long = status.txt.length > 12;
    doc.roundedRect(R - 170, 134, 170, 34, 6).lineWidth(2).strokeColor(status.col).stroke();
    doc.fillColor(status.col).font('Helvetica-Bold').fontSize(long ? 10 : 16)
      .text(status.txt, R - 170, long ? 147 : 142, { width: 170, align: 'center' });

    // Data rumah
    const cara = [...new Set(payments.map((p) => METODE[p.method] || METODE.tunai))].join(' + ') || '-';
    const ket = lunas ? 'Lunas' : `Belum lunas, sisa ${rp(Math.max(0, b.outstanding))}`;
    let y = 186;
    doc.roundedRect(L, y, W, 110, 8).fillColor(C.soft).fill();
    [['Nama', `Bp/Ibu ${b.owner_name}`], ['Alamat', 'Gang Alamanda, Griya Asri Gadingan 3'], ['No. Rumah', b.no_rumah],
      ['Periode', periodLabel(b.period)], ['Cara bayar', cara], ['Keterangan', ket]].forEach(([k, v], i) => {
      const yy = y + 10 + i * 16;
      doc.fillColor(C.mute).font('Helvetica').fontSize(9.5).text(k, L + 14, yy, { width: 80 });
      doc.fillColor(C.text).font('Helvetica-Bold').text(`:  ${v}`, L + 94, yy, { width: W - 110 });
    });

    // Pencatatan meteran
    y = 312;
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(11).text('PENCATATAN METERAN', L, y);
    y += 20;
    if (b.flat) {
      doc.roundedRect(L, y, W, 46, 8).lineWidth(1).strokeColor(C.line).stroke();
      doc.fillColor(C.mute).font('Helvetica').fontSize(10).text('Tidak memakai air (tarif flat)', L, y + 16, { width: W, align: 'center' });
      y += 46;
    } else {
      const bw = (W - 20) / 3;
      [['Meter Awal', b.meter_awal], ['Meter Akhir', b.meter_akhir], ['Pemakaian', b.billed_m3 ?? b.usage_m3]].forEach(([k, v], i) => {
        const x = L + i * (bw + 10);
        const hi = i === 2;
        doc.roundedRect(x, y, bw, 52, 8).lineWidth(1).fillAndStroke(hi ? C.green : '#ffffff', hi ? C.green : C.line);
        doc.fillColor(hi ? '#cfe5d2' : C.mute).font('Helvetica').fontSize(9).text(k, x, y + 8, { width: bw, align: 'center' });
        doc.fillColor(hi ? '#ffffff' : C.text).font('Helvetica-Bold').fontSize(17)
          .text(v == null ? '-' : `${Number(v)} m3`, x, y + 24, { width: bw, align: 'center' });
      });
      y += 52;
    }

    // Rincian pembayaran
    y += 22;
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(11).text('RINCIAN PEMBAYARAN', L, y);
    y += 20;
    const rows = [];
    if (b.flat) rows.push(['Tarif flat (tidak memakai air)', '', rp(t?.flat_nominal ?? b.amount)]);
    else {
      const over = Math.max(0, Math.ceil(Number(b.billed_m3 ?? 0)) - (t?.abodemen_m3 ?? 0));
      const calc = (t?.abodemen_nominal ?? 0) + over * (t?.tambahan_per_m3 ?? 0);
      rows.push([`Abodemen (s.d. ${t?.abodemen_m3 ?? '-'} m3)`, '', rp(t?.abodemen_nominal)]);
      rows.push(['Kelebihan pemakaian', over ? `${over} m3 x ${rp(t.tambahan_per_m3)}` : '-', rp(over * (t?.tambahan_per_m3 ?? 0))]);
      if (calc !== b.amount) rows.push(['Penyesuaian (justifikasi)', '', rp(b.amount - calc)]);
    }
    rows.push(['Denda', '', '-']);
    const rh = 26;
    doc.rect(L, y, W, rh).fillColor(C.green).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5)
      .text('Keterangan', L + 12, y + 8).text('Perhitungan', L + 250, y + 8, { width: 130 })
      .text('Jumlah', R - 112, y + 8, { width: 100, align: 'right' });
    y += rh;
    rows.forEach((r, i) => {
      if (i % 2) doc.rect(L, y, W, rh).fillColor('#f7faf7').fill();
      doc.fillColor(C.text).font('Helvetica').fontSize(10).text(r[0], L + 12, y + 8)
        .fillColor(C.mute).text(r[1], L + 250, y + 8, { width: 130 })
        .fillColor(C.text).text(r[2], R - 112, y + 8, { width: 100, align: 'right' });
      y += rh;
    });
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(C.line).stroke();
    doc.rect(L, y, W, 34).fillColor(C.soft).fill();
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(11).text('TOTAL PEMBAYARAN', L + 12, y + 11)
      .fontSize(15).text(rp(b.amount), R - 182, y + 9, { width: 170, align: 'right' });
    y += 34;
    b.adjustments.forEach((a) => {
      y += 6;
      doc.fillColor(C.mute).font('Helvetica-Oblique').fontSize(8.5).text(`Catatan: ${a.reason}`, L + 4, y, { width: W - 8 });
      y = doc.y;
    });

    // Riwayat pembayaran
    y += 20;
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(11).text('RIWAYAT PEMBAYARAN', L, y);
    y += 18;
    if (!payments.length) {
      doc.fillColor(C.mute).font('Helvetica').fontSize(10).text('Belum ada pembayaran tercatat.', L + 4, y);
      y += 16;
    } else {
      payments.forEach((p) => {
        doc.fillColor(C.text).font('Helvetica').fontSize(10).text(fmtDate(p.paid_at), L + 4, y, { width: 90 })
          .fillColor(C.mute).text([p.method === 'transfer' ? 'Transfer' : 'Tunai', p.note].filter(Boolean).join(' - '), L + 100, y, { width: W - 230, lineBreak: false, ellipsis: true })
          .fillColor(C.text).text(rp(p.amount), R - 112, y, { width: 108, align: 'right' });
        y += 16;
        doc.moveTo(L, y - 3).lineTo(R, y - 3).lineWidth(0.5).strokeColor(C.line).stroke();
      });
    }
    y += 6;
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10.5).text('Total dibayar', L + 4, y)
      .text(rp(b.paid), R - 112, y, { width: 108, align: 'right' });
    y += 18;
    doc.fillColor(b.outstanding > 0 ? C.red : C.green).text('Sisa tagihan', L + 4, y)
      .text(rp(Math.max(0, b.outstanding)), R - 112, y, { width: 108, align: 'right' });
    y += 34;

    // Rekening bendahara (hanya bila masih ada sisa tagihan)
    if (bank) {
      const bx = L;
      const bw = W - 210;
      doc.roundedRect(bx, y, bw, 96, 8).lineWidth(1).fillAndStroke(C.soft, C.line);
      doc.fillColor(C.green).font('Helvetica-Bold').fontSize(10).text('PEMBAYARAN VIA TRANSFER', bx + 12, y + 10, { width: bw - 24 });
      doc.fillColor(C.mute).font('Helvetica').fontSize(8.5).text(bank.bank + ` a.n. ${bank.holder}`, bx + 12, y + 26, { width: bw - 24 });
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(15).text(bank.account_no, bx + 12, y + 40, { width: bw - 24 });
      doc.fillColor(C.mute).font('Helvetica').fontSize(8.5).text('Berita transfer:', bx + 12, y + 64)
        .fillColor(C.text).font('Helvetica-Bold').text(transferNote(b), bx + 12, y + 76, { width: bw - 24 });
    }

    // Tanda tangan
    const sx = R - 190;
    doc.fillColor(C.text).font('Helvetica').fontSize(10).text(`Sukoharjo, ${TGL(new Date())}`, sx, y, { width: 190, align: 'center' });
    doc.text('Pengurus Air Gang Alamanda', sx, y + 14, { width: 190, align: 'center' });
    // Tanda tangan sementara (goresan), diganti gambar asli bila sudah ada
    doc.save().lineWidth(1.6).lineCap('round').strokeColor('#1b3a8a')
      .moveTo(sx + 45, y + 62).bezierCurveTo(sx + 55, y + 28, sx + 75, y + 30, sx + 70, y + 54)
      .bezierCurveTo(sx + 66, y + 70, sx + 88, y + 36, sx + 98, y + 40)
      .bezierCurveTo(sx + 108, y + 44, sx + 92, y + 66, sx + 106, y + 62)
      .bezierCurveTo(sx + 118, y + 58, sx + 124, y + 44, sx + 140, y + 50).stroke()
      .moveTo(sx + 44, y + 70).bezierCurveTo(sx + 80, y + 64, sx + 120, y + 72, sx + 152, y + 64).lineWidth(1).stroke().restore();
    doc.moveTo(sx + 30, y + 80).lineTo(sx + 160, y + 80).lineWidth(0.8).strokeColor(C.text).stroke();
    doc.fillColor(C.mute).fontSize(8.5).text('Bendahara', sx, y + 84, { width: 190, align: 'center' });
    doc.fillColor(C.mute).fontSize(8).text('Dokumen ini dibuat otomatis oleh sistem Pencatatan Air Alamanda.', L, doc.page.height - 56, { width: W, align: 'center', lineBreak: false });
  });
}

export default async function (app) {
  const staff = app.auth(...OPS_ROLES);

  // Laporan kas per dana & tahun, dengan rincian bulanan. Dapat dibaca semua peran (transparansi);
  // kas masuk hanya berupa ringkasan (tanpa nama rumah), pengeluaran dirinci.
  app.get('/reports/kas/:fund', {
    preHandler: app.auth(),
    schema: { params: { type: 'object', properties: { fund: { type: 'string', enum: ['jimpitan', 'air'] } } } },
  }, async (req) => {
    const { fund } = req.params;
    const year = Number(req.query.year) || new Date().getFullYear();
    const sums = (await query(
      `SELECT DATE_FORMAT(entry_date,'%Y-%m') AS bulan,
         COALESCE(SUM(CASE WHEN direction='in' THEN amount END),0) AS masuk,
         COALESCE(SUM(CASE WHEN direction='in' AND payment_id IS NULL THEN amount END),0) AS masuk_lain,
         COUNT(DISTINCT CASE WHEN direction='in' THEN payment_id END) AS jumlah_bayar,
         COALESCE(SUM(CASE WHEN direction='out' THEN amount END),0) AS keluar
       FROM cash_entries WHERE fund=$1 AND EXTRACT(YEAR FROM entry_date)=$2 GROUP BY 1`, [fund, year]
    )).rows;
    const expenses = (await query(
      `SELECT id, DATE_FORMAT(entry_date,'%Y-%m') AS bulan, entry_date, category, description, amount
       FROM cash_entries WHERE fund=$1 AND direction='out' AND EXTRACT(YEAR FROM entry_date)=$2
       ORDER BY entry_date, id`, [fund, year]
    )).rows;
    const incomes = (await query(
      `SELECT id, DATE_FORMAT(entry_date,'%Y-%m') AS bulan, entry_date, category, description, amount
       FROM cash_entries WHERE fund=$1 AND direction='in' AND payment_id IS NULL AND EXTRACT(YEAR FROM entry_date)=$2
       ORDER BY entry_date, id`, [fund, year]
    )).rows;
    const saldoAwal = (await query(
      `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::int AS saldo
       FROM cash_entries WHERE fund=$1 AND EXTRACT(YEAR FROM entry_date)<$2`, [fund, year]
    )).rows[0].saldo;
    let run = saldoAwal;
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const r = sums.find((x) => x.bulan === key) || { masuk: 0, masuk_lain: 0, jumlah_bayar: 0, keluar: 0 };
      run += r.masuk - r.keluar;
      months.push({ bulan: key, masuk: r.masuk, masuk_pembayaran: r.masuk - r.masuk_lain, masuk_lain: r.masuk_lain, jumlah_bayar: r.jumlah_bayar,
        keluar: r.keluar, incomes: incomes.filter((e) => e.bulan === key), expenses: expenses.filter((e) => e.bulan === key) });
    }
    return { fund, year, saldo_awal: saldoAwal, months, saldo_akhir: run };
  });

  // PDF laporan tagihan seluruh warga untuk satu periode (dibagikan tgl 7)
  app.get('/periods/:period/report.pdf', { preHandler: staff }, async (req, reply) => {
    const period = assertPeriod(req.params.period);
    const rows = await withAdjustments((await query(`${BILL_SELECT} WHERE b.period=$1 ORDER BY h.sort_no`, [period])).rows);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    return pdfReply(reply, `tagihan-air-${period}.pdf`, (doc) => {
      doc.font('Helvetica-Bold').fontSize(14).text('Tagihan Air Griya Asri Gadingan 3', { align: 'center' });
      doc.font('Helvetica').fontSize(11).text(`Periode pemakaian ${periodLabel(period)}`, { align: 'center' }).moveDown();
      table(doc, [
        { title: 'No', w: 35 }, { title: 'Pemilik', w: 150 },
        { title: 'Awal', w: 50, align: 'right' }, { title: 'Akhir', w: 50, align: 'right' },
        { title: 'm3', w: 35, align: 'right' }, { title: 'Tagihan', w: 70, align: 'right' }, { title: 'Status', w: 125 },
      ], rows.map((r) => [
        r.no_rumah, r.owner_name, r.meter_awal ?? '-', r.meter_akhir ?? '-',
        r.flat ? '-' : (r.billed_m3 ?? '-'), r.recorded_at ? rp(r.amount) : '-',
        !r.recorded_at ? 'Belum dicatat' : r.outstanding <= 0 ? 'Lunas' : r.paid > 0 ? `Kurang ${rp(r.outstanding)}` : 'Belum bayar',
      ]));
      doc.moveDown().font('Helvetica-Bold').text(`Total tagihan: ${rp(total)}    Terbayar: ${rp(paid)}    Sisa: ${rp(total - paid)}`);
    });
  });

  // PDF daftar rumah aktif (status selain nonaktif)
  app.get('/houses/report.pdf', { preHandler: staff }, async (req, reply) => {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || 'active');

    const { rows } = await query(
      `SELECT no_rumah, owner_name, phone, status, notes FROM houses 
        WHERE ($1 = 'all' OR ($1 = 'active' AND status <> 'nonaktif') OR status = $1)
          AND ($2 = '' OR CONCAT_WS(' ', no_rumah, owner_name, phone) LIKE CONCAT('%', $2, '%'))
        ORDER BY sort_no`,
        [status, q]
    );
    const STATUS = { normal: 'Normal', tidak_pakai: 'Flat (tidak pakai air)' };
    const today = new Date().toISOString().slice(0, 10);
    return pdfReply(reply, `data-rumah-aktif-${today}.pdf`, (doc) => {
      doc.font('Helvetica-Bold').fontSize(14).text('Data Rumah Aktif Griya Asri Gadingan 3', { align: 'center' });
      doc.font('Helvetica').fontSize(11).text(`Per ${today} - ${rows.length} rumah`, { align: 'center' }).moveDown();
      table(doc, [
        { title: 'No', w: 40 }, { title: 'Pemilik', w: 150 }, { title: 'WhatsApp', w: 90 },
        { title: 'Status', w: 110 }, { title: 'Catatan', w: 125 },
      ], rows.map((r) => [r.no_rumah, r.owner_name, r.phone || '-', STATUS[r.status] || r.status, r.notes]));
    });
  });

  // PDF tagihan satu rumah (pemilik hanya miliknya)
  app.get('/bills/:id/invoice.pdf', { preHandler: app.auth() }, async (req, reply) => {
    const b = await loadBillFor(req, req.params.id);
    const payments = (await query('SELECT * FROM payments WHERE bill_id=$1 ORDER BY id', [b.id])).rows;
    return await invoicePdf(reply, b, payments);
  });

  // Link publik bertanda tangan (dikirim lewat WhatsApp), tanpa login
  app.get('/share/invoice.pdf', async (req, reply) => {
    let p;
    try { p = app.jwt.verify(String(req.query.t || '')); } catch { return reply.code(403).send({ error: 'Link tidak valid atau sudah kedaluwarsa' }); }
    if (p.scope !== 'invoice') return reply.code(403).send({ error: 'Link tidak valid' });
    const rows = await withAdjustments((await query(`${BILL_SELECT} WHERE b.id=$1`, [p.bill])).rows);
    if (!rows[0]) return reply.code(404).send({ error: 'Tagihan tidak ditemukan' });
    const payments = (await query('SELECT * FROM payments WHERE bill_id=$1 ORDER BY id', [p.bill])).rows;
    return invoicePdf(reply, rows[0], payments);
  });
}

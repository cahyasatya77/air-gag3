import PDFDocument from 'pdfkit';
import { query } from '../db/pool.js';
import { assertPeriod } from '../services/billing.js';
import { BILL_SELECT, loadBillFor } from './billing.js';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const periodLabel = (p) => `${BULAN[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;
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

export function invoicePdf(reply, b, payments) {
  return pdfReply(reply, `tagihan-${b.no_rumah}-${b.period}.pdf`, (doc) => {
    doc.font('Helvetica-Bold').fontSize(14).text('Tagihan Air Griya Asri Gadingan 3', { align: 'center' }).moveDown();
    doc.font('Helvetica').fontSize(11);
    const line = (k, v) => doc.text(`${k.padEnd(22)}: ${v}`);
    line('Rumah', `${b.no_rumah} - ${b.owner_name}`);
    line('Periode', periodLabel(b.period));
    if (b.flat) line('Jenis', 'Tidak memakai air (tarif flat)');
    else {
      line('Meter awal', b.meter_awal ?? '-');
      line('Meter akhir', b.meter_akhir ?? '-');
      line('Pemakaian ditagihkan', `${b.billed_m3 ?? '-'} m3`);
    }
    b.adjustments.forEach((a) => line('Justifikasi', `${a.type}: ${a.reason}`));
    doc.moveDown().font('Helvetica-Bold').text(`Total tagihan : ${rp(b.amount)}`);
    doc.font('Helvetica');
    payments.forEach((p) => doc.text(`Dibayar ${fmtDate(p.paid_at)}: ${rp(p.amount)}`));
    doc.font('Helvetica-Bold').text(`Sisa          : ${rp(b.outstanding)}`);
  });
}

export default async function (app) {
  const staff = app.auth('pengurus');

  // Laporan kas per dana & tahun, dengan rincian bulanan. Dapat dibaca semua peran (transparansi);
  // kas masuk hanya berupa ringkasan (tanpa nama rumah), pengeluaran dirinci.
  app.get('/reports/kas/:fund', {
    preHandler: app.auth(),
    schema: { params: { type: 'object', properties: { fund: { type: 'string', enum: ['jimpitan', 'air'] } } } },
  }, async (req) => {
    const { fund } = req.params;
    const year = Number(req.query.year) || new Date().getFullYear();
    const sums = (await query(
      `SELECT to_char(entry_date,'YYYY-MM') AS bulan,
         COALESCE(SUM(amount) FILTER (WHERE direction='in'),0)::int AS masuk,
         COUNT(DISTINCT payment_id) FILTER (WHERE direction='in')::int AS jumlah_bayar,
         COALESCE(SUM(amount) FILTER (WHERE direction='out'),0)::int AS keluar
       FROM cash_entries WHERE fund=$1 AND EXTRACT(YEAR FROM entry_date)=$2 GROUP BY 1`, [fund, year]
    )).rows;
    const expenses = (await query(
      `SELECT id, to_char(entry_date,'YYYY-MM') AS bulan, entry_date, category, description, amount
       FROM cash_entries WHERE fund=$1 AND direction='out' AND EXTRACT(YEAR FROM entry_date)=$2
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
      const r = sums.find((x) => x.bulan === key) || { masuk: 0, jumlah_bayar: 0, keluar: 0 };
      run += r.masuk - r.keluar;
      months.push({ bulan: key, masuk: r.masuk, jumlah_bayar: r.jumlah_bayar, keluar: r.keluar, saldo: run,
        expenses: expenses.filter((e) => e.bulan === key) });
    }
    return { fund, year, saldo_awal: saldoAwal, months, saldo_akhir: run };
  });

  // PDF laporan tagihan seluruh warga untuk satu periode (dibagikan tgl 7)
  app.get('/periods/:period/report.pdf', { preHandler: staff }, async (req, reply) => {
    const period = assertPeriod(req.params.period);
    const { rows } = await query(`${BILL_SELECT} WHERE b.period=$1 ORDER BY h.sort_no`, [period]);
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

  // PDF tagihan satu rumah (pemilik hanya miliknya)
  app.get('/bills/:id/invoice.pdf', { preHandler: app.auth() }, async (req, reply) => {
    const b = await loadBillFor(req, req.params.id);
    const payments = (await query('SELECT * FROM payments WHERE bill_id=$1 ORDER BY id', [b.id])).rows;
    return invoicePdf(reply, b, payments);
  });

  // Link publik bertanda tangan (dikirim lewat WhatsApp), tanpa login
  app.get('/share/invoice.pdf', async (req, reply) => {
    let p;
    try { p = app.jwt.verify(String(req.query.t || '')); } catch { return reply.code(403).send({ error: 'Link tidak valid atau sudah kedaluwarsa' }); }
    if (p.scope !== 'invoice') return reply.code(403).send({ error: 'Link tidak valid' });
    const { rows } = await query(`${BILL_SELECT} WHERE b.id=$1`, [p.bill]);
    if (!rows[0]) return reply.code(404).send({ error: 'Tagihan tidak ditemukan' });
    const payments = (await query('SELECT * FROM payments WHERE bill_id=$1 ORDER BY id', [p.bill])).rows;
    return invoicePdf(reply, rows[0], payments);
  });
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

import { transferNote } from './bank.js';

/** 08xx / +62xx / 62xx -> 62xx (format wa.me). Kosong bila tidak valid. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : '';
}

export function buildMessage(b, link, bank = null) {
  const per = `${BULAN[Number(b.period.slice(5)) - 1]} ${b.period.slice(0, 4)}`;
  const lines = [`Yth. Bapak/Ibu ${b.owner_name || ''} (Rumah ${b.no_rumah})`, '', `Tagihan air periode ${per}:`];
  if (b.flat) lines.push('- Tarif flat (tidak memakai air)');
  else lines.push(`- Meter ${b.meter_awal ?? '?'} → ${b.meter_akhir ?? '?'} (${b.billed_m3} m³)`);
  lines.push(`- Total: ${rp(b.amount)}`);
  if (b.paid > 0) lines.push(`- Sudah dibayar: ${rp(b.paid)}`);
  lines.push(b.outstanding > 0 ? `- Sisa yang harus dibayar: ${rp(b.outstanding)}` : '- Status: LUNAS');
  if (bank && b.outstanding > 0) {
    lines.push('', 'Pembayaran via transfer:', `- Bank: ${bank.bank}`, `- No. Rekening: ${bank.account_no}`);
    lines.push(`- Atas nama: ${bank.holder}`);
    lines.push(`- Berita transfer: ${transferNote(b)}`, '(Atau bayar tunai ke bendahara. Mohon kirim bukti transfer di chat ini.)');
  }
  lines.push('', `Rincian (PDF): ${link}`, '', 'Terima kasih. Pengurus Air Alamanda GAG3');
  return lines.join('\n');
}

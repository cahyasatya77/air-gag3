const LOCALE = 'id-ID'
const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export const formatRupiah = (value) => `Rp ${Number(value || 0).toLocaleString(LOCALE)}`
export const formatNumber = (value, fallback = '-') =>
  value === null || value === undefined || value === ''
    ? fallback
    : Number(value).toLocaleString(LOCALE)

/** '2026-10' -> 'Oktober 2026' */
export const periodLabel = (period) => {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return '-'
  return `${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`
}

export const shiftPeriod = (period, delta) => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Pencatatan tgl 5 mencatat meter akhir bulan sebelumnya, jadi di awal bulan default ke bulan lalu. */
export const defaultPeriod = () =>
  new Date().getDate() <= 10 ? shiftPeriod(currentPeriod(), -1) : currentPeriod()

export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const formatDate = (value, fallback = '-') => {
  if (!value) return fallback
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDateTime = (value, fallback = '-') => {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Rumus tagihan (sama dengan backend) untuk pratinjau nominal saat input meter. */
export const calcAmount = (usage, tariff) => {
  if (!tariff) return null
  const over = Math.max(0, Math.ceil(usage) - tariff.abodemen_m3)
  return tariff.abodemen_nominal + over * tariff.tambahan_per_m3
}

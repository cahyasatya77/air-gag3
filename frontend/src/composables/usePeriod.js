import { ref } from 'vue'
import { billingService } from '@/services/billing'
import { defaultPeriod, shiftPeriod } from '@/utils/formatters'

// Periode terpilih dipakai bersama (Pencatatan, Beranda, ...) agar tidak berpindah-pindah.
// Hanya periode yang sudah dibuat pengurus yang bisa dipilih; kosong ('') bila belum ada.
const period = ref('')
const periods = ref([])

const loadPeriods = async () => {
  periods.value = await billingService.periods()
  if (!periods.value.includes(period.value)) period.value = periods.value[0] ?? ''
}

/** Periode berikutnya yang bisa dibuat: sesudah periode terbaru, atau periode berjalan bila belum ada. */
const nextPeriod = () => (periods.value.length ? shiftPeriod(periods.value[0], 1) : defaultPeriod())

const createPeriod = async (target = nextPeriod()) => {
  await billingService.createPeriod(target)
  await loadPeriods()
  period.value = target
  return target
}

export const usePeriod = () => ({ period, periods, loadPeriods, nextPeriod, createPeriod })

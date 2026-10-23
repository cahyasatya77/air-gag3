import { ref } from 'vue'
import { defaultPeriod } from '@/utils/formatters'

// Periode terpilih dipakai bersama (Pencatatan, Beranda, ...) agar tidak berpindah-pindah.
const period = ref(defaultPeriod())

export const usePeriod = () => ({ period })

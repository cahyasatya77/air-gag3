<script setup>
import { ref, computed } from 'vue'
import { CalendarPlus, Loader2 } from '@lucide/vue'
import { errorMessage } from '@/services/api'
import { usePeriod } from '@/composables/usePeriod'
import { useAuthStore } from '@/stores/auth'
import { periodLabel } from '@/utils/formatters'
import AppModal from '@/components/AppModal.vue'
import FormLabel from '@/components/FormLabel.vue'

// Memilih hanya dari periode yang sudah dibuat; periode baru dibuat manual lewat dialog.
const period = defineModel({ type: String, required: true })
const emit = defineEmits(['created', 'error'])

const auth = useAuthStore()
const { periods, nextPeriod, createPeriod } = usePeriod()
const creating = ref(false)
const open = ref(false)
const target = ref('')
const serverError = ref('')

const openDialog = () => {
  target.value = nextPeriod()
  serverError.value = ''
  open.value = true
}

// Aturan yang sama dengan server: tidak boleh ganda, dan sesudah periode pertama harus berurutan.
const problem = computed(() => {
  const t = target.value
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) return 'Pilih bulan dan tahun periode.'
  if (periods.value.includes(t)) return `Periode ${periodLabel(t)} sudah dibuat.`
  if (periods.value.length && t !== nextPeriod()) {
    return `Periode harus berurutan: berikutnya adalah ${periodLabel(nextPeriod())}.`
  }
  return ''
})

const create = async () => {
  creating.value = true
  serverError.value = ''
  try {
    const made = await createPeriod(target.value)
    open.value = false
    emit('created', made)
  } catch (e) {
    serverError.value = errorMessage(e, 'Gagal membuat periode.')
    emit('error', serverError.value)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <select
      v-if="periods.length"
      v-model="period"
      aria-label="Pilih periode"
      class="input w-auto min-w-40 font-semibold"
    >
      <option v-for="p in periods" :key="p" :value="p">{{ periodLabel(p) }}</option>
    </select>
    <span v-else class="text-sm text-gray-500">Belum ada periode</span>

    <button v-if="auth.canCreatePeriod" type="button" class="btn btn-ghost" @click="openDialog">
      <CalendarPlus class="h-4 w-4" aria-hidden="true" />
      Buat periode
    </button>

    <AppModal
      v-model="open"
      title="Buat periode"
      subtitle="Tagihan dibuat untuk semua rumah aktif pada periode ini."
    >
      <form id="period-form" class="space-y-3" @submit.prevent="create">
        <div>
          <FormLabel for="new-period" required>Bulan periode</FormLabel>
          <input id="new-period" v-model="target" type="month" class="input" required />
        </div>
        <p class="text-xs text-gray-500">
          <template v-if="periods.length">
            Periode terakhir: <b>{{ periodLabel(periods[0]) }}</b>. Periode baru harus berurutan
            dan tidak boleh sama dengan yang sudah ada.
          </template>
          <template v-else>
            Ini periode pertama, bulan bebas dipilih. Periode berikutnya harus berurutan.
          </template>
        </p>
        <p v-if="problem" class="text-sm font-medium text-amber-700">{{ problem }}</p>
        <p v-if="serverError" class="text-sm font-medium text-red-600" role="alert">
          {{ serverError }}
        </p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button
          type="submit"
          form="period-form"
          class="btn btn-primary"
          :disabled="creating || !!problem"
        >
          <Loader2 v-if="creating" class="h-4 w-4 animate-spin" aria-hidden="true" />
          Buat periode
        </button>
      </template>
    </AppModal>
  </div>
</template>

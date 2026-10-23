<script setup>
import { ref, watch } from 'vue'
import { billingService } from '@/services/billing'
import { errorMessage } from '@/services/api'
import { periodLabel } from '@/utils/formatters'
import AppModal from '@/components/AppModal.vue'
import FormLabel from '@/components/FormLabel.vue'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps({
  bill: { type: Object, default: null },
  /** Meter akhir yang ditolak karena lebih kecil dari awal (opsional, untuk mengisi otomatis). */
  suggestedAkhir: { type: Number, default: null },
})
const emit = defineEmits(['saved'])

const TYPES = [
  { value: 'meter_rusak', label: 'Meteran rusak' },
  { value: 'ganti_meteran', label: 'Ganti meteran' },
  { value: 'pemutusan', label: 'Pemutusan / pelepasan meteran' },
  { value: 'lainnya', label: 'Lainnya' },
]

const form = ref({})
const saving = ref(false)
const error = ref('')

const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

watch(open, (isOpen) => {
  if (!isOpen || !props.bill) return
  form.value = {
    type: props.suggestedAkhir != null ? 'ganti_meteran' : 'meter_rusak',
    override_m3: props.bill.billed_m3 ?? '',
    override_amount: '',
    meter_awal_next: props.suggestedAkhir ?? '',
    reason: '',
  }
  error.value = ''
})

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    await billingService.adjust(props.bill.id, {
      type: form.value.type,
      override_m3: toNumber(form.value.override_m3),
      override_amount: toNumber(form.value.override_amount),
      meter_awal_next: toNumber(form.value.meter_awal_next),
      reason: form.value.reason,
    })
    open.value = false
    emit('saved', `Justifikasi ${props.bill.no_rumah} disimpan.`)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    v-model="open"
    title="Justifikasi tagihan"
    :subtitle="
      bill ? `Rumah ${bill.no_rumah} · ${bill.owner_name} · ${periodLabel(bill.period)}` : ''
    "
  >
    <form v-if="bill" id="adjust-form" class="space-y-4" @submit.prevent="submit">
      <p v-if="suggestedAkhir != null" class="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Meter akhir {{ suggestedAkhir }} lebih kecil dari meter awal {{ bill.meter_awal }}. Isi
        pemakaian yang ditagihkan, dan meter awal bulan depan bila meteran diganti.
      </p>

      <div>
        <FormLabel for="adj-type">Jenis</FormLabel>
        <select id="adj-type" v-model="form.type" class="input">
          <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <FormLabel for="adj-m3" hint="Pemakaian yang akan ditagihkan">Pemakaian (m³)</FormLabel>
          <input
            id="adj-m3"
            v-model="form.override_m3"
            type="number"
            step="any"
            min="0"
            class="input"
          />
        </div>
        <div>
          <FormLabel for="adj-amount" hint="Jika diisi, menimpa perhitungan dari m³"
            >Atau nominal (Rp)</FormLabel
          >
          <input
            id="adj-amount"
            v-model="form.override_amount"
            type="number"
            min="0"
            class="input"
          />
        </div>
      </div>

      <div>
        <FormLabel
          for="adj-next"
          hint="Isi bila meteran diganti; bulan depan dihitung dari angka ini"
        >
          Meter awal bulan depan
        </FormLabel>
        <input
          id="adj-next"
          v-model="form.meter_awal_next"
          type="number"
          step="any"
          min="0"
          class="input"
        />
      </div>

      <div>
        <FormLabel for="adj-reason" required>Alasan</FormLabel>
        <textarea id="adj-reason" v-model="form.reason" rows="3" class="input" required />
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
      <button type="submit" form="adjust-form" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Menyimpan…' : 'Simpan justifikasi' }}
      </button>
    </template>
  </AppModal>
</template>

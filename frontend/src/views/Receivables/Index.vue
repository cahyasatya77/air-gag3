<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus, Search } from '@lucide/vue'
import { billingService } from '@/services/billing'
import { masterService } from '@/services/master'
import { errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import { formatRupiah, periodLabel, defaultPeriod } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'

const auth = useAuthStore()
const { sucMsg, errMsg, ok, fail } = useNotify()

const rows = ref([])
const houses = ref([])
const loading = ref(false)
const search = ref('')

const load = async () => {
  loading.value = true
  try {
    rows.value = await billingService.receivables()
  } catch (e) {
    fail(e, 'Gagal memuat data.')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  load()
  if (auth.isAdmin) houses.value = await masterService.houses().catch(() => [])
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => !q || `${r.no_rumah} ${r.owner_name}`.toLowerCase().includes(q))
})
const total = computed(() => rows.value.reduce((s, r) => s + r.total, 0))

// ---- Tambah tunggakan lama (administrator) ----
const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = ref({})
const toNumber = (v) => (v === '' || v == null ? null : Number(v))

const openForm = () => {
  form.value = {
    house_id: houses.value[0]?.id,
    period: defaultPeriod(),
    amount: '',
    meter_awal: '',
    meter_akhir: '',
    note: '',
  }
  error.value = ''
  open.value = true
}

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    await billingService.addArrears({
      house_id: Number(form.value.house_id),
      period: form.value.period,
      amount: toNumber(form.value.amount),
      meter_awal: toNumber(form.value.meter_awal),
      meter_akhir: toNumber(form.value.meter_akhir),
      note: form.value.note,
    })
    open.value = false
    ok('Tunggakan ditambahkan.')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      title="Tagihan Belum Lunas"
      :subtitle="`Total ${formatRupiah(total)} dari ${rows.length} rumah`"
    >
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Cari rumah / pemilik"
          aria-label="Cari"
          class="input w-full pl-9 sm:w-64"
        />
      </div>
      <button v-if="auth.isAdmin" type="button" class="btn btn-primary" @click="openForm">
        <Plus class="h-4 w-4" aria-hidden="true" /> Tunggakan lama
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading" loading />
      <EmptyState v-else-if="!filtered.length" message="Tidak ada tagihan yang belum lunas. 🎉" />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Rumah</th>
            <th class="th">Pemilik</th>
            <th class="th text-right">Bulan</th>
            <th class="th">Periode</th>
            <th class="th text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.house_id">
            <td class="td font-bold">{{ r.no_rumah }}</td>
            <td class="td">{{ r.owner_name }}</td>
            <td class="td text-right tabular-nums">{{ r.jumlah_bulan }}</td>
            <td class="td text-gray-600">{{ r.periods.map(periodLabel).join(', ') }}</td>
            <td class="td text-right font-semibold tabular-nums">{{ formatRupiah(r.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal
      v-model="open"
      title="Tambah tunggakan lama"
      subtitle="Isi nominal, atau meter awal dan akhir."
    >
      <form id="arrears-form" class="space-y-4" @submit.prevent="submit">
        <div>
          <FormLabel for="ar-house" required>Rumah</FormLabel>
          <select id="ar-house" v-model="form.house_id" class="input" required>
            <option v-for="h in houses" :key="h.id" :value="h.id">
              {{ h.no_rumah }} · {{ h.owner_name }}
            </option>
          </select>
        </div>
        <div>
          <FormLabel for="ar-period" required>Bulan pemakaian</FormLabel>
          <input id="ar-period" v-model="form.period" type="month" class="input" required />
        </div>
        <div>
          <FormLabel for="ar-amount">Nominal tunggakan (Rp)</FormLabel>
          <input id="ar-amount" v-model="form.amount" type="number" min="1" class="input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <FormLabel for="ar-awal">Meter awal</FormLabel>
            <input
              id="ar-awal"
              v-model="form.meter_awal"
              type="number"
              step="any"
              min="0"
              class="input"
            />
          </div>
          <div>
            <FormLabel for="ar-akhir">Meter akhir</FormLabel>
            <input
              id="ar-akhir"
              v-model="form.meter_akhir"
              type="number"
              step="any"
              min="0"
              class="input"
            />
          </div>
        </div>
        <div>
          <FormLabel for="ar-note" required>Keterangan</FormLabel>
          <textarea id="ar-note" v-model="form.note" rows="2" class="input" required />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="arrears-form" class="btn btn-primary" :disabled="saving">
          Simpan
        </button>
      </template>
    </AppModal>
  </div>
</template>

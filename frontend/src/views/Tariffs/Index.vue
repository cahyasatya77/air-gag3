<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@lucide/vue'
import { masterService } from '@/services/master'
import { errorMessage } from '@/services/api'
import { useNotify } from '@/composables/useNotify'
import { currentPeriod, formatRupiah, periodLabel } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'

const { sucMsg, errMsg, ok, fail } = useNotify()

const tariffs = ref([])
const loading = ref(false)

const load = async () => {
  loading.value = true
  try {
    tariffs.value = await masterService.tariffs()
  } catch (e) {
    fail(e, 'Gagal memuat tarif.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = ref({})

const openForm = () => {
  const c = tariffs.value[0] ?? {}
  form.value = {
    effective_from: currentPeriod(),
    abodemen_m3: c.abodemen_m3 ?? 15,
    abodemen_nominal: c.abodemen_nominal ?? 25000,
    tambahan_per_m3: c.tambahan_per_m3 ?? 1000,
    flat_nominal: c.flat_nominal ?? 10000,
    kas_jimpitan: c.kas_jimpitan ?? 10000,
  }
  error.value = ''
  open.value = true
}

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    const f = form.value
    await masterService.createTariff({
      effective_from: f.effective_from,
      abodemen_m3: Number(f.abodemen_m3),
      abodemen_nominal: Number(f.abodemen_nominal),
      tambahan_per_m3: Number(f.tambahan_per_m3),
      flat_nominal: Number(f.flat_nominal),
      kas_jimpitan: Number(f.kas_jimpitan),
    })
    open.value = false
    ok('Tarif baru disimpan.')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

const FIELDS = [
  {
    key: 'abodemen_m3',
    label: 'Batas abodemen (m³)',
    hint: 'Pemakaian sampai batas ini dikenai nominal abodemen',
  },
  { key: 'abodemen_nominal', label: 'Nominal abodemen (Rp)' },
  {
    key: 'tambahan_per_m3',
    label: 'Tambahan per m³ (Rp)',
    hint: 'Untuk setiap 1 m³ di atas batas abodemen',
  },
  {
    key: 'flat_nominal',
    label: 'Nominal flat (Rp)',
    hint: 'Rumah yang tidak memakai air perumahan',
  },
  {
    key: 'kas_jimpitan',
    label: 'Bagian kas jimpitan (Rp)',
    hint: 'Dari setiap tagihan; sisanya ke kas pengelolaan air',
  },
]
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      title="Rumus Tagihan"
      subtitle="Tarif berlaku mulai periode yang ditentukan; tagihan lama tidak berubah."
    >
      <button type="button" class="btn btn-primary" @click="openForm">
        <Plus class="h-4 w-4" aria-hidden="true" /> Tarif baru
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !tariffs.length" loading />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Berlaku mulai</th>
            <th class="th text-right">Abodemen (m³)</th>
            <th class="th text-right">Nominal abodemen</th>
            <th class="th text-right">Tambahan / m³</th>
            <th class="th text-right">Flat</th>
            <th class="th text-right">Kas jimpitan</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="(t, i) in tariffs" :key="t.id">
            <td class="td font-medium">
              {{ periodLabel(t.effective_from) }}
              <span v-if="i === 0" class="badge badge-green ml-1">terbaru</span>
            </td>
            <td class="td text-right">{{ t.abodemen_m3 }}</td>
            <td class="td text-right">{{ formatRupiah(t.abodemen_nominal) }}</td>
            <td class="td text-right">{{ formatRupiah(t.tambahan_per_m3) }}</td>
            <td class="td text-right">{{ formatRupiah(t.flat_nominal) }}</td>
            <td class="td text-right">{{ formatRupiah(t.kas_jimpitan) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal
      v-model="open"
      title="Tarif baru"
      subtitle="Nilai awal diambil dari tarif terbaru saat ini."
    >
      <form id="tariff-form" class="space-y-4" @submit.prevent="submit">
        <div>
          <FormLabel for="t-from" required>Berlaku mulai periode</FormLabel>
          <input id="t-from" v-model="form.effective_from" type="month" class="input" required />
        </div>
        <div v-for="f in FIELDS" :key="f.key">
          <FormLabel :for="`t-${f.key}`" :hint="f.hint" hint-inline required>{{
            f.label
          }}</FormLabel>
          <input
            :id="`t-${f.key}`"
            v-model="form[f.key]"
            type="number"
            min="0"
            class="input"
            required
          />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="tariff-form" class="btn btn-primary" :disabled="saving">
          Simpan tarif
        </button>
      </template>
    </AppModal>
  </div>
</template>

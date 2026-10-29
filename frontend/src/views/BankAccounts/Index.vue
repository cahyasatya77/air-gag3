<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@lucide/vue'
import { masterService } from '@/services/master'
import { errorMessage } from '@/services/api'
import { useNotify } from '@/composables/useNotify'
import Alert from '@/components/Alert.vue'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'

const { sucMsg, errMsg, ok, fail } = useNotify()

const accounts = ref([])
const loading = ref(false)

const load = async () => {
  loading.value = true
  try {
    accounts.value = await masterService.bankAccounts()
  } catch (e) {
    fail(e, 'Gagal memuat rekening.')
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
  const c = accounts.value[0] ?? {}
  form.value = { bank: c.bank ?? '', account_no: c.account_no ?? '', holder: c.holder ?? '' }
  error.value = ''
  open.value = true
}

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    await masterService.createBankAccount({
      bank: form.value.bank,
      account_no: form.value.account_no,
      holder: form.value.holder,
    })
    open.value = false
    ok('Rekening bendahara disimpan.')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

const formatDateTime = (v) =>
  new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      title="Rekening Bendahara"
      subtitle="Rekening terbaru tampil di PDF dan pesan WhatsApp tagihan yang belum lunas. Riwayat perubahan tersimpan."
    >
      <button type="button" class="btn btn-primary" @click="openForm">
        <Plus class="h-4 w-4" aria-hidden="true" /> {{ accounts.length ? 'Ganti rekening' : 'Isi rekening' }}
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !accounts.length" loading />
      <EmptyState v-else-if="!accounts.length" message="Rekening bendahara belum diisi." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Bank</th>
            <th class="th">No. rekening</th>
            <th class="th">Atas nama</th>
            <th class="th">Diubah oleh</th>
            <th class="th">Waktu</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="(a, i) in accounts" :key="a.id">
            <td class="td font-medium">
              {{ a.bank }}
              <span v-if="i === 0" class="badge badge-green ml-1">berlaku</span>
            </td>
            <td class="td">{{ a.account_no }}</td>
            <td class="td">{{ a.holder }}</td>
            <td class="td text-gray-600">{{ a.created_by_name || '-' }}</td>
            <td class="td text-gray-600">{{ formatDateTime(a.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal
      v-model="open"
      title="Rekening bendahara"
      subtitle="Rekening lama tetap tersimpan di riwayat."
    >
      <form id="bank-form" class="space-y-4" @submit.prevent="submit">
        <div>
          <FormLabel for="b-bank" required>Bank</FormLabel>
          <input id="b-bank" v-model="form.bank" class="input" placeholder="mis. BCA" required />
        </div>
        <div>
          <FormLabel for="b-no" required>Nomor rekening</FormLabel>
          <input id="b-no" v-model="form.account_no" class="input" inputmode="numeric" required />
        </div>
        <div>
          <FormLabel for="b-holder" required>Atas nama</FormLabel>
          <input id="b-holder" v-model="form.holder" class="input" required />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="bank-form" class="btn btn-primary" :disabled="saving">
          Simpan rekening
        </button>
      </template>
    </AppModal>
  </div>
</template>

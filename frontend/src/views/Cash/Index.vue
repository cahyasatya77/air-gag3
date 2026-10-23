<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Trash2, TrendingDown, TrendingUp, Wallet } from '@lucide/vue'
import { cashService } from '@/services/cash'
import { errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import { formatDate, formatRupiah, todayISO } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

// Halaman ini dipakai dua rute (/kas/jimpitan dan /kas/air); dana ditentukan oleh meta.fund
const FUNDS = {
  jimpitan: {
    title: 'Kas Jimpitan',
    subtitle: 'Bagian jimpitan dari setiap pembayaran tagihan masuk otomatis ke kas ini.',
  },
  air: {
    title: 'Kas Air',
    subtitle:
      'Sisa pembayaran tagihan setelah bagian jimpitan masuk otomatis ke kas pengelolaan air.',
  },
}

const route = useRoute()
const fund = route.meta.fund
const info = FUNDS[fund]

const auth = useAuthStore()
const { sucMsg, errMsg, ok, fail, run } = useNotify()

const book = ref(null)
const loading = ref(false)

const load = async () => {
  loading.value = true
  try {
    book.value = await cashService.book(fund)
  } catch (e) {
    fail(e, 'Gagal memuat kas.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const saldo = computed(() => book.value?.saldo[fund])
const entries = computed(() => book.value?.entries ?? [])

const describe = (e) =>
  e.direction === 'in'
    ? `Kas masuk ${e.no_rumah || ''} · ${e.description}`.trim()
    : (e.category ? `${e.category}: ` : '') + e.description

// ---- Pengeluaran ----
const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = ref({})

const openForm = () => {
  form.value = { amount: '', entry_date: todayISO(), category: '', description: '' }
  error.value = ''
  open.value = true
}

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    await cashService.addExpense({ ...form.value, fund, amount: Number(form.value.amount) })
    open.value = false
    ok('Pengeluaran dicatat.')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

const remove = async (e) => {
  if (!confirm(`Hapus pengeluaran "${describe(e)}" ${formatRupiah(e.amount)}?`)) return
  if (await run(() => cashService.deleteExpense(e.id), 'Pengeluaran dihapus.')) load()
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader :title="info.title" :subtitle="info.subtitle">
      <button type="button" class="btn btn-primary" @click="openForm">
        <Plus class="h-4 w-4" aria-hidden="true" /> Catat pengeluaran
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div v-if="saldo" class="grid gap-3 md:grid-cols-3">
      <StatCard label="Saldo kas" :value="formatRupiah(saldo.saldo)" :icon="Wallet" />
      <StatCard
        label="Kas masuk (otomatis dari pembayaran)"
        :value="formatRupiah(saldo.masuk)"
        :icon="TrendingUp"
        tone="green"
      />
      <StatCard
        label="Total pengeluaran"
        :value="formatRupiah(saldo.keluar)"
        :icon="TrendingDown"
        tone="red"
      />
    </div>

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !book" loading />
      <EmptyState v-else-if="!entries.length" message="Belum ada transaksi di kas ini." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Tanggal</th>
            <th class="th">Keterangan</th>
            <th class="th text-right">Kas masuk</th>
            <th class="th text-right">Pengeluaran</th>
            <th class="th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="td whitespace-nowrap">{{ formatDate(e.entry_date) }}</td>
            <td class="td">{{ describe(e) }}</td>
            <td class="td text-right font-semibold text-green-700 tabular-nums">
              {{ e.direction === 'in' ? formatRupiah(e.amount) : '' }}
            </td>
            <td class="td text-right font-semibold text-red-600 tabular-nums">
              {{ e.direction === 'out' ? formatRupiah(e.amount) : '' }}
            </td>
            <td class="td text-right">
              <button
                v-if="e.direction === 'out' && auth.isAdmin"
                type="button"
                class="btn btn-ghost btn-sm text-red-600"
                aria-label="Hapus pengeluaran"
                @click="remove(e)"
              >
                <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal v-model="open" :title="`Catat pengeluaran ${info.title}`">
      <form id="expense-form" class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <FormLabel for="ex-amount" required>Nominal (Rp)</FormLabel>
            <input
              id="ex-amount"
              v-model="form.amount"
              type="number"
              min="1"
              class="input"
              required
            />
          </div>
          <div>
            <FormLabel for="ex-date">Tanggal</FormLabel>
            <input id="ex-date" v-model="form.entry_date" type="date" class="input" />
          </div>
        </div>
        <div>
          <FormLabel for="ex-cat">Kategori (opsional)</FormLabel>
          <input
            id="ex-cat"
            v-model="form.category"
            class="input"
            placeholder="mis. Perbaikan, Listrik"
          />
        </div>
        <div>
          <FormLabel for="ex-desc" required>Keterangan</FormLabel>
          <input id="ex-desc" v-model="form.description" class="input" required />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="expense-form" class="btn btn-primary" :disabled="saving">
          Simpan
        </button>
      </template>
    </AppModal>
  </div>
</template>

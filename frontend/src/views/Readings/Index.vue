<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import {
  FileDown,
  MessageCircle,
  RefreshCw,
  Search,
  Wallet,
  Scale,
  Check,
  Loader2,
} from '@lucide/vue'
import { billingService } from '@/services/billing'
import { masterService } from '@/services/master'
import { errorMessage } from '@/services/api'
import { usePeriod } from '@/composables/usePeriod'
import { useNotify } from '@/composables/useNotify'
import { calcAmount, formatNumber, formatRupiah, periodLabel } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import BillStatusBadge from '@/components/BillStatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import StatCard from '@/components/StatCard.vue'
import PaymentModal from './components/PaymentModal.vue'
import AdjustmentModal from './components/AdjustmentModal.vue'
import PaymentHistoryModal from './components/PaymentHistoryModal.vue'

const { period } = usePeriod()
const { sucMsg, errMsg, ok, fail } = useNotify()

const bills = ref([])
const tariffs = ref([])
const loading = ref(false)
const search = ref('')
const filter = ref('all')
const drafts = reactive({}) // id -> isi kolom meter akhir
const awalDrafts = reactive({}) // id -> isi kolom meter awal (bila kosong)
const savingId = ref(null)
const savedId = ref(null)

const payBill = ref(null)
const payOpen = ref(false)
const histBill = ref(null)
const histOpen = ref(false)
const adjBill = ref(null)
const adjOpen = ref(false)
const adjSuggested = ref(null)

const tariff = computed(() => tariffs.value.find((t) => t.effective_from <= period.value) ?? null)

const load = async (silent = false) => {
  if (!silent) loading.value = true
  try {
    bills.value = await billingService.periodBills(period.value)
    bills.value.forEach((b) => {
      drafts[b.id] = b.meter_akhir ?? ''
      awalDrafts[b.id] = ''
    })
  } catch (e) {
    fail(e, 'Gagal memuat tagihan.')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    tariffs.value = await masterService.tariffs()
  } catch {
    /* pratinjau nominal opsional */
  }
  load()
})
watch(period, () => load())

const FILTERS = [
  { key: 'all', label: 'Semua', test: () => true },
  { key: 'todo', label: 'Belum dicatat', test: (b) => !b.recorded_at },
  { key: 'unpaid', label: 'Belum bayar', test: (b) => b.recorded_at && b.outstanding > 0 },
  { key: 'paid', label: 'Lunas', test: (b) => b.recorded_at && b.outstanding <= 0 },
]

const counts = computed(() =>
  Object.fromEntries(FILTERS.map((f) => [f.key, bills.value.filter(f.test).length])),
)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const test = FILTERS.find((f) => f.key === filter.value).test
  return bills.value.filter(
    (b) => test(b) && (!q || `${b.no_rumah} ${b.owner_name}`.toLowerCase().includes(q)),
  )
})

const totals = computed(() => {
  const amount = bills.value.reduce((s, b) => s + b.amount, 0)
  const paid = bills.value.reduce((s, b) => s + b.paid, 0)
  return { amount, paid, rest: amount - paid }
})
const progress = computed(() =>
  bills.value.length
    ? Math.round(((counts.value.all - counts.value.todo) / bills.value.length) * 100)
    : 0,
)

// Pratinjau pemakaian & nominal selagi mengetik
const preview = (b) => {
  const raw = drafts[b.id]
  if (b.flat || raw === '' || raw === undefined || b.meter_awal == null) return null
  if (Number(raw) === b.meter_akhir) return null
  const usage = Number(raw) - b.meter_awal
  if (usage < 0) return { usage, warn: true }
  return { usage, amount: calcAmount(usage, tariff.value) }
}

const focusNext = async (id) => {
  await nextTick()
  const ids = rows.value.filter((b) => !b.flat && b.paid === 0).map((b) => b.id)
  const next = ids[ids.indexOf(id) + 1]
  if (next) document.querySelector(`[data-reading="${next}"]`)?.focus()
}

const saveReading = async (b) => {
  const raw = drafts[b.id]
  if (raw === '' || raw === null || Number(raw) === b.meter_akhir || savingId.value === b.id) return
  savingId.value = b.id
  try {
    await billingService.saveReading(b.id, Number(raw))
    savedId.value = b.id
    setTimeout(() => (savedId.value = null), 1500)
    await load(true)
    return true
  } catch (e) {
    if (e?.response?.status === 422) {
      adjBill.value = b
      adjSuggested.value = Number(raw)
      adjOpen.value = true
    } else {
      fail(e)
    }
  } finally {
    savingId.value = null
  }
}

const onEnter = async (b) => {
  if (await saveReading(b)) focusNext(b.id)
  else if (Number(drafts[b.id]) === b.meter_akhir) focusNext(b.id)
}

const saveAwal = async (b) => {
  const raw = awalDrafts[b.id]
  if (raw === '') return
  try {
    await billingService.saveMeterAwal(b.id, Number(raw))
    await load(true)
  } catch (e) {
    fail(e)
  }
}

const openPay = (b) => {
  payBill.value = b
  payOpen.value = true
}
const openHistory = (b) => {
  histBill.value = b
  histOpen.value = true
}
const openAdjust = (b) => {
  adjBill.value = b
  adjSuggested.value = null
  adjOpen.value = true
}
const onSaved = (message) => {
  ok(message)
  load(true)
}

const sendWhatsApp = async (b) => {
  const popup = window.open('', '_blank') // dibuka dulu agar tidak diblokir browser
  try {
    const { wa_url } = await billingService.share(b.id)
    if (popup) popup.location = wa_url
  } catch (e) {
    popup?.close()
    fail(errorMessage(e))
  }
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      title="Pencatatan Meteran"
      :subtitle="`Pemakaian bulan ${periodLabel(period)} · meter akhir diisi saat pencatatan tanggal 5 bulan berikutnya`"
    >
      <PeriodPicker v-model="period" />
      <button
        type="button"
        class="btn btn-ghost"
        title="Muat ulang"
        aria-label="Muat ulang"
        @click="load()"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
      </button>
      <a :href="billingService.periodReportUrl(period)" target="_blank" class="btn btn-ghost">
        <FileDown class="h-4 w-4" aria-hidden="true" /> PDF laporan
      </a>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card p-4">
        <p class="text-xs font-medium text-gray-500">Sudah dicatat</p>
        <p class="mt-0.5 text-xl font-bold tabular-nums">
          {{ counts.all - counts.todo
          }}<span class="text-sm font-medium text-gray-400"> / {{ counts.all }} rumah</span>
        </p>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            class="h-full rounded-full bg-brand-600 transition-all"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
      <StatCard label="Total tagihan" :value="formatRupiah(totals.amount)" :icon="Scale" />
      <StatCard
        label="Sudah dibayar"
        :value="formatRupiah(totals.paid)"
        :icon="Check"
        tone="green"
      />
      <StatCard
        label="Belum dibayar"
        :value="formatRupiah(totals.rest)"
        :icon="Wallet"
        tone="amber"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
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
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter status">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="btn btn-sm"
          :class="filter === f.key ? 'btn-primary' : 'btn-ghost'"
          @click="filter = f.key"
        >
          {{ f.label }} <span class="opacity-70">{{ counts[f.key] }}</span>
        </button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <EmptyState v-if="loading && !bills.length" loading />
      <EmptyState v-else-if="!rows.length" message="Tidak ada rumah yang cocok." />

      <table v-else class="block w-full md:table">
        <thead class="hidden md:table-header-group">
          <tr>
            <th class="th">Rumah</th>
            <th class="th text-right">Meter awal</th>
            <th class="th text-right">Meter akhir</th>
            <th class="th text-right">Pemakaian</th>
            <th class="th text-right">Tagihan</th>
            <th class="th">Status</th>
            <th class="th text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="block md:table-row-group">
          <tr
            v-for="b in rows"
            :key="b.id"
            class="block border-t border-gray-100 p-3 hover:bg-gray-50/60 md:table-row md:p-0"
          >
            <td class="flex items-center justify-between gap-2 md:table-cell md:px-4 md:py-2.5">
              <div>
                <p class="font-bold text-gray-900">
                  {{ b.no_rumah }}
                  <span v-if="b.flat" class="badge badge-blue ml-1">flat</span>
                </p>
                <p class="text-xs text-gray-500">{{ b.owner_name }}</p>
              </div>
              <BillStatusBadge :bill="b" class="md:hidden" />
            </td>

            <td
              class="flex items-center justify-between py-1 md:table-cell md:px-4 md:py-2.5 md:text-right"
            >
              <span class="text-xs text-gray-500 md:hidden">Meter awal</span>
              <input
                v-if="b.meter_awal == null && !b.flat"
                v-model="awalDrafts[b.id]"
                type="number"
                step="any"
                min="0"
                placeholder="isi awal"
                class="input w-28 text-right"
                aria-label="Meter awal"
                @keydown.enter.prevent="saveAwal(b)"
                @blur="saveAwal(b)"
              />
              <span v-else class="tabular-nums">{{ formatNumber(b.meter_awal) }}</span>
            </td>

            <td
              class="flex items-center justify-between py-1 md:table-cell md:px-4 md:py-2.5 md:text-right"
            >
              <span class="text-xs text-gray-500 md:hidden">Meter akhir</span>
              <span v-if="b.flat" class="text-xs text-gray-400">tanpa meteran</span>
              <div v-else class="flex items-center justify-end gap-1.5">
                <Loader2
                  v-if="savingId === b.id"
                  class="h-4 w-4 animate-spin text-brand-600"
                  aria-hidden="true"
                />
                <Check
                  v-else-if="savedId === b.id"
                  class="h-4 w-4 text-green-600"
                  aria-hidden="true"
                />
                <input
                  v-model="drafts[b.id]"
                  :data-reading="b.id"
                  type="number"
                  step="any"
                  min="0"
                  inputmode="decimal"
                  :disabled="b.paid > 0 || b.meter_awal == null"
                  :placeholder="b.meter_awal == null ? 'isi awal dulu' : 'isi meter'"
                  aria-label="Meter akhir"
                  class="input w-28 text-right tabular-nums"
                  @keydown.enter.prevent="onEnter(b)"
                  @blur="saveReading(b)"
                />
              </div>
            </td>

            <td
              class="flex items-center justify-between py-1 md:table-cell md:px-4 md:py-2.5 md:text-right"
            >
              <span class="text-xs text-gray-500 md:hidden">Pemakaian</span>
              <span
                v-if="preview(b)"
                :class="preview(b).warn ? 'text-red-600' : 'text-brand-700'"
                class="text-sm tabular-nums"
              >
                {{ preview(b).warn ? 'lebih kecil dari awal' : `${preview(b).usage} m³` }}
              </span>
              <span v-else class="tabular-nums">
                {{ b.flat ? '-' : b.billed_m3 == null ? '-' : `${formatNumber(b.billed_m3)} m³` }}
                <span
                  v-if="b.adjustments.length"
                  class="badge badge-amber ml-1"
                  title="Ada justifikasi"
                  >J</span
                >
              </span>
            </td>

            <td
              class="flex items-center justify-between py-1 md:table-cell md:px-4 md:py-2.5 md:text-right"
            >
              <span class="text-xs text-gray-500 md:hidden">Tagihan</span>
              <span v-if="preview(b)?.amount" class="text-sm text-brand-700 tabular-nums"
                >≈ {{ formatRupiah(preview(b).amount) }}</span
              >
              <span v-else class="font-semibold tabular-nums">{{
                b.recorded_at ? formatRupiah(b.amount) : '-'
              }}</span>
            </td>

            <td class="hidden md:table-cell md:px-4 md:py-2.5"><BillStatusBadge :bill="b" /></td>

            <td
              class="flex flex-wrap justify-end gap-1.5 pt-2 md:table-cell md:px-4 md:py-2.5 md:text-right md:whitespace-nowrap"
            >
              <button
                v-if="b.recorded_at && b.outstanding > 0"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openPay(b)"
              >
                Bayar
              </button>
              <button
                v-if="b.paid > 0"
                type="button"
                class="btn btn-ghost btn-sm"
                title="Lihat atau batalkan pembayaran"
                @click="openHistory(b)"
              >
                Riwayat bayar
              </button>
              <button
                v-if="!b.flat"
                type="button"
                class="btn btn-ghost btn-sm"
                @click="openAdjust(b)"
              >
                Justifikasi
              </button>
              <template v-if="b.recorded_at">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :title="b.phone ? 'Kirim lewat WhatsApp' : 'Nomor WhatsApp belum diisi'"
                  aria-label="Kirim WhatsApp"
                  @click="sendWhatsApp(b)"
                >
                  <MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <a
                  :href="billingService.invoiceUrl(b.id)"
                  target="_blank"
                  class="btn btn-ghost btn-sm"
                  title="PDF tagihan"
                  aria-label="PDF tagihan"
                >
                  <FileDown class="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaymentModal v-model="payOpen" :bill="payBill" @saved="onSaved" />
    <PaymentHistoryModal v-model="histOpen" :bill="histBill" @saved="onSaved" />
    <AdjustmentModal
      v-model="adjOpen"
      :bill="adjBill"
      :suggested-akhir="adjSuggested"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { ClipboardList, FileDown, HandCoins, History, PiggyBank, Wallet } from '@lucide/vue'
import { billingService } from '@/services/billing'
import { cashService } from '@/services/cash'
import { usePeriod } from '@/composables/usePeriod'
import { useNotify } from '@/composables/useNotify'
import { formatRupiah, periodLabel } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import StatCard from '@/components/StatCard.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { period, loadPeriods } = usePeriod()
const { sucMsg, errMsg, ok, fail } = useNotify()

const bills = ref([])
const cash = ref(null)
const receivables = ref([])
const loading = ref(false)

const load = async () => {
  loading.value = true
  try {
    ;[bills.value, cash.value, receivables.value] = await Promise.all([
      period.value ? billingService.periodBills(period.value) : [],
      cashService.book(),
      billingService.receivables(),
    ])
  } catch (e) {
    fail(e, 'Gagal memuat ringkasan.')
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  try {
    await loadPeriods()
  } catch (e) {
    fail(e, 'Gagal memuat daftar periode.')
  }
  load()
})
watch(period, load)

const recorded = computed(() => bills.value.filter((b) => b.recorded_at).length)
const todo = computed(() => bills.value.length - recorded.value)
const amount = computed(() => bills.value.reduce((s, b) => s + b.amount, 0))
const paid = computed(() => bills.value.reduce((s, b) => s + b.paid, 0))
const arrears = computed(() => receivables.value.reduce((s, r) => s + r.total, 0))

// Pengingat jadwal: pencatatan tgl 5, laporan PDF ke warga tgl 7
const reminder = computed(() => {
  const day = new Date().getDate()
  if (day >= 5 && day < 7 && todo.value > 0)
    return `Hari pencatatan meteran: masih ${todo.value} rumah belum dicatat.`
  if (day === 7) return 'Hari ini jadwal pengiriman laporan tagihan ke warga (PDF / WhatsApp).'
  return ''
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      :title="`Halo, ${auth.displayName}`"
      :subtitle="period ? `Ringkasan pemakaian ${periodLabel(period)}` : 'Belum ada periode'"
    >
      <PeriodPicker
        v-model="period"
        @created="(p) => ok(`Periode ${periodLabel(p)} dibuat.`)"
        @error="fail"
      />
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <p
      v-if="reminder"
      class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800"
    >
      {{ reminder }}
    </p>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Meteran dicatat"
        :value="`${recorded} / ${bills.length}`"
        :hint="todo ? `${todo} rumah belum dicatat` : 'Semua sudah dicatat'"
        :icon="ClipboardList"
        :tone="todo ? 'amber' : 'green'"
      />
      <StatCard label="Total tagihan" :value="formatRupiah(amount)" :icon="HandCoins" />
      <StatCard
        label="Sudah dibayar"
        :value="formatRupiah(paid)"
        :hint="`Sisa ${formatRupiah(amount - paid)}`"
        :icon="Wallet"
        tone="green"
      />
      <StatCard
        label="Total tunggakan"
        :value="formatRupiah(arrears)"
        :hint="`${receivables.length} rumah`"
        :icon="History"
        tone="red"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <StatCard
        label="Saldo kas jimpitan"
        :value="formatRupiah(cash?.saldo.jimpitan.saldo)"
        :icon="PiggyBank"
      />
      <StatCard
        label="Saldo kas pengelolaan air"
        :value="formatRupiah(cash?.saldo.air.saldo)"
        :icon="PiggyBank"
      />
    </div>

    <div class="card p-5">
      <h2 class="mb-3 text-sm font-bold text-gray-900">Aksi cepat</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/pencatatan" class="btn btn-primary"
          ><ClipboardList class="h-4 w-4" aria-hidden="true" /> Catat meteran</RouterLink
        >
        <RouterLink to="/tunggakan" class="btn btn-ghost"
          ><History class="h-4 w-4" aria-hidden="true" /> Tagihan belum lunas</RouterLink
        >
        <RouterLink to="/kas" class="btn btn-ghost"
          ><Wallet class="h-4 w-4" aria-hidden="true" /> Buku kas</RouterLink
        >
        <a
          v-if="period"
          :href="billingService.periodReportUrl(period)"
          target="_blank"
          class="btn btn-ghost"
        >
          <FileDown class="h-4 w-4" aria-hidden="true" /> PDF laporan {{ periodLabel(period) }}
        </a>
      </div>
    </div>
  </div>
</template>

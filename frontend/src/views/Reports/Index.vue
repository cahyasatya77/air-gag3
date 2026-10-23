<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, ChevronLeft, ChevronRight, Printer } from '@lucide/vue'
import { cashService } from '@/services/cash'
import { useNotify } from '@/composables/useNotify'
import { formatDate, formatRupiah, periodLabel } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'

// Halaman ini dipakai dua rute (/laporan/jimpitan dan /laporan/air); dana ditentukan oleh meta.fund.
// Terbuka untuk pemilik rumah (transparansi): kas masuk berupa ringkasan, pengeluaran dirinci.
const TITLES = { jimpitan: 'Laporan Kas Jimpitan', air: 'Laporan Kas Air' }

const route = useRoute()
const fund = route.meta.fund

const { sucMsg, errMsg, fail } = useNotify()

const year = ref(new Date().getFullYear())
const report = ref(null)
const loading = ref(false)
const openMonths = ref({})

const load = async () => {
  loading.value = true
  try {
    report.value = await cashService.yearReport(fund, year.value)
    // bulan yang berisi transaksi dibuka otomatis
    openMonths.value = Object.fromEntries(
      report.value.months.filter((m) => m.masuk || m.keluar).map((m) => [m.bulan, true]),
    )
  } catch (e) {
    fail(e, 'Gagal memuat laporan.')
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(year, load)

const toggle = (bulan) => (openMonths.value[bulan] = !openMonths.value[bulan])
const print = () => window.print()

const totals = computed(() => ({
  masuk: report.value?.months.reduce((s, m) => s + m.masuk, 0) ?? 0,
  keluar: report.value?.months.reduce((s, m) => s + m.keluar, 0) ?? 0,
}))
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      :title="TITLES[fund]"
      :subtitle="`Rincian per bulan tahun ${year}: kas masuk (otomatis dari pembayaran tagihan) dan pengeluaran.`"
    >
      <div class="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1">
        <button
          type="button"
          aria-label="Tahun sebelumnya"
          class="cursor-pointer rounded-md p-1.5 hover:bg-gray-100"
          @click="year--"
        >
          <ChevronLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <span class="min-w-16 text-center text-sm font-semibold">{{ year }}</span>
        <button
          type="button"
          aria-label="Tahun berikutnya"
          class="cursor-pointer rounded-md p-1.5 hover:bg-gray-100"
          @click="year++"
        >
          <ChevronRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="btn btn-ghost" @click="print">
        <Printer class="h-4 w-4" aria-hidden="true" /> Cetak
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <EmptyState v-if="loading && !report" loading />

    <template v-else-if="report">
      <div class="card divide-y divide-gray-100 overflow-hidden">
        <div class="flex items-center justify-between bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span>Saldo awal tahun {{ year }}</span>
          <span class="font-semibold tabular-nums">{{ formatRupiah(report.saldo_awal) }}</span>
        </div>

        <section v-for="m in report.months" :key="m.bulan">
          <button
            type="button"
            :aria-expanded="!!openMonths[m.bulan]"
            class="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-gray-50 sm:grid-cols-[1fr_9rem_9rem_9rem]"
            @click="toggle(m.bulan)"
          >
            <span class="flex items-center gap-2 font-semibold text-gray-900">
              <ChevronDown
                class="h-4 w-4 text-gray-400 transition-transform"
                :class="{ '-rotate-90': !openMonths[m.bulan] }"
                aria-hidden="true"
              />
              {{ periodLabel(m.bulan) }}
            </span>
            <span class="text-right text-sm font-semibold text-green-700 tabular-nums">
              <span class="mr-1 text-xs font-normal text-gray-400">masuk</span
              >{{ formatRupiah(m.masuk) }}
            </span>
            <span class="text-right text-sm font-semibold text-red-600 tabular-nums">
              <span class="mr-1 text-xs font-normal text-gray-400">keluar</span
              >{{ formatRupiah(m.keluar) }}
            </span>
            <span class="hidden text-right text-sm font-bold tabular-nums sm:block">
              <span class="mr-1 text-xs font-normal text-gray-400">saldo</span
              >{{ formatRupiah(m.saldo) }}
            </span>
          </button>

          <div v-show="openMonths[m.bulan]" class="space-y-3 bg-gray-50/60 px-4 py-3 pl-10 text-sm">
            <div class="flex justify-between gap-3">
              <span class="text-gray-600">
                Kas masuk dari <b>{{ m.jumlah_bayar }}</b> pembayaran tagihan
              </span>
              <span class="font-semibold text-green-700 tabular-nums">{{
                formatRupiah(m.masuk)
              }}</span>
            </div>

            <div>
              <p class="mb-1 text-xs font-bold tracking-wider text-gray-500 uppercase">
                Pengeluaran
              </p>
              <p v-if="!m.expenses.length" class="text-gray-400">Tidak ada pengeluaran.</p>
              <ul
                v-else
                class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white"
              >
                <li
                  v-for="e in m.expenses"
                  :key="e.id"
                  class="flex justify-between gap-3 px-3 py-2"
                >
                  <span>
                    <span class="text-xs text-gray-500">{{ formatDate(e.entry_date) }}</span>
                    <span v-if="e.category" class="badge badge-gray ml-2">{{ e.category }}</span>
                    <br />
                    {{ e.description }}
                  </span>
                  <span class="shrink-0 font-semibold text-red-600 tabular-nums">
                    {{ formatRupiah(e.amount) }}
                  </span>
                </li>
              </ul>
            </div>

            <div class="flex justify-between border-t border-gray-200 pt-2 font-semibold sm:hidden">
              <span>Saldo akhir bulan</span>
              <span class="tabular-nums">{{ formatRupiah(m.saldo) }}</span>
            </div>
          </div>
        </section>

        <div class="flex justify-between bg-gray-50 px-4 py-3 text-sm font-bold">
          <span>Total {{ year }}</span>
          <span class="tabular-nums">
            <span class="text-green-700">{{ formatRupiah(totals.masuk) }}</span>
            <span class="mx-2 text-gray-300">|</span>
            <span class="text-red-600">{{ formatRupiah(totals.keluar) }}</span>
          </span>
        </div>
        <div class="flex justify-between bg-brand-50 px-4 py-3 text-base font-bold text-brand-800">
          <span>Saldo akhir (saldo awal + kas masuk − pengeluaran)</span>
          <span class="tabular-nums">{{ formatRupiah(report.saldo_akhir) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

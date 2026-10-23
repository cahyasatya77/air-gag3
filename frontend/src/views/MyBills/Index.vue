<script setup>
import { ref, computed, onMounted } from 'vue'
import { CircleCheck, FileDown } from '@lucide/vue'
import { billingService } from '@/services/billing'
import { useNotify } from '@/composables/useNotify'
import { formatDate, formatNumber, formatRupiah, periodLabel } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import BillStatusBadge from '@/components/BillStatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { HandCoins } from '@lucide/vue'

const { sucMsg, errMsg, fail } = useNotify()

const bills = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    bills.value = await billingService.myBills()
  } catch (e) {
    fail(e, 'Gagal memuat tagihan.')
  } finally {
    loading.value = false
  }
})

const due = computed(() => bills.value.filter((b) => b.outstanding > 0))
const dueTotal = computed(() => due.value.reduce((s, b) => s + b.outstanding, 0))
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Tagihan Saya" subtitle="Riwayat tagihan dan pembayaran air rumah Anda." />
    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <StatCard
      v-if="!loading"
      :label="due.length ? 'Tagihan yang belum dibayar' : 'Status pembayaran'"
      :value="due.length ? formatRupiah(dueTotal) : 'Tidak ada tunggakan'"
      :hint="
        due.length ? `${due.length} bulan belum lunas` : 'Terima kasih sudah membayar tepat waktu'
      "
      :icon="due.length ? HandCoins : CircleCheck"
      :tone="due.length ? 'red' : 'green'"
    />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading" loading />
      <EmptyState v-else-if="!bills.length" message="Belum ada tagihan." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Periode</th>
            <th class="th">Rumah</th>
            <th class="th text-right">Meter</th>
            <th class="th text-right">Pemakaian</th>
            <th class="th text-right">Tagihan</th>
            <th class="th">Pembayaran</th>
            <th class="th">Status</th>
            <th class="th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bills" :key="b.id">
            <td class="td font-medium whitespace-nowrap">{{ periodLabel(b.period) }}</td>
            <td class="td">{{ b.no_rumah }}</td>
            <td class="td text-right whitespace-nowrap tabular-nums">
              {{
                b.flat
                  ? '-'
                  : `${formatNumber(b.meter_awal, '?')} → ${formatNumber(b.meter_akhir, '?')}`
              }}
            </td>
            <td class="td text-right tabular-nums">
              {{ b.flat ? 'Flat' : `${formatNumber(b.billed_m3)} m³` }}
            </td>
            <td class="td text-right font-semibold tabular-nums">{{ formatRupiah(b.amount) }}</td>
            <td class="td text-xs text-gray-600">
              <p v-for="p in b.payments" :key="p.id">
                {{ formatDate(p.paid_at) }}: {{ formatRupiah(p.amount) }}
              </p>
              <span v-if="!b.payments.length">-</span>
            </td>
            <td class="td"><BillStatusBadge :bill="b" /></td>
            <td class="td text-right">
              <a
                :href="billingService.invoiceUrl(b.id)"
                target="_blank"
                class="btn btn-ghost btn-sm"
                aria-label="PDF tagihan"
              >
                <FileDown class="h-3.5 w-3.5" aria-hidden="true" /> PDF
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

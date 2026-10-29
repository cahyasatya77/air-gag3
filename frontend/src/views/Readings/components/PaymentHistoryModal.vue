<script setup>
import { ref, watch } from 'vue'
import { Undo2 } from '@lucide/vue'
import { billingService } from '@/services/billing'
import { errorMessage } from '@/services/api'
import { formatDate, formatRupiah, periodLabel } from '@/utils/formatters'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps({ bill: { type: Object, default: null } })
const emit = defineEmits(['saved'])

const payments = ref([])
const loading = ref(false)
const cancelling = ref(null) // id pembayaran yang sedang dibatalkan
const reason = ref('')
const saving = ref(false)
const error = ref('')

const load = async () => {
  loading.value = true
  try {
    payments.value = (await billingService.get(props.bill.id)).payments
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (!isOpen || !props.bill) return
  cancelling.value = null
  reason.value = ''
  error.value = ''
  load()
})

const confirmCancel = async () => {
  saving.value = true
  error.value = ''
  try {
    await billingService.cancelPayment(cancelling.value, reason.value)
    open.value = false
    emit('saved', `Pembayaran ${props.bill.no_rumah} dibatalkan. Kas sudah dikoreksi.`)
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
    title="Riwayat pembayaran"
    :subtitle="
      bill ? `Rumah ${bill.no_rumah} · ${bill.owner_name} · ${periodLabel(bill.period)}` : ''
    "
  >
    <EmptyState v-if="loading" loading />
    <EmptyState v-else-if="!payments.length" message="Belum ada pembayaran." />

    <ul v-else class="divide-y divide-gray-100">
      <li v-for="p in payments" :key="p.id" class="py-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold tabular-nums">{{ formatRupiah(p.amount) }}</p>
            <p class="text-xs text-gray-500">
              {{ formatDate(p.paid_at) }} · {{ p.method === 'transfer' ? 'Transfer' : 'Tunai' }}<span v-if="p.note"> · {{ p.note }}</span>
            </p>
          </div>
          <button
            v-if="cancelling !== p.id"
            type="button"
            class="btn btn-ghost btn-sm text-red-600"
            @click="((cancelling = p.id), (reason = ''), (error = ''))"
          >
            <Undo2 class="h-3.5 w-3.5" aria-hidden="true" /> Batalkan
          </button>
        </div>

        <form
          v-if="cancelling === p.id"
          class="mt-3 space-y-2 rounded-lg bg-red-50 p-3"
          @submit.prevent="confirmCancel"
        >
          <p class="text-xs text-red-800">
            Pembayaran ini akan dihapus dan kas masuknya dikoreksi. Tindakan tercatat di audit log.
          </p>
          <input
            v-model="reason"
            class="input"
            placeholder="Alasan pembatalan (mis. salah klik)"
            minlength="3"
            required
            autofocus
          />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm" @click="cancelling = null">
              Tidak jadi
            </button>
            <button type="submit" class="btn btn-danger btn-sm" :disabled="saving">
              {{ saving ? 'Memproses…' : 'Ya, batalkan pembayaran' }}
            </button>
          </div>
        </form>
      </li>
    </ul>

    <p v-if="error" class="mt-3 text-sm font-medium text-red-600" role="alert">{{ error }}</p>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="open = false">Tutup</button>
    </template>
  </AppModal>
</template>

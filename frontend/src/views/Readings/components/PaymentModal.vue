<script setup>
import { ref, watch } from 'vue'
import { billingService } from '@/services/billing'
import { errorMessage } from '@/services/api'
import { formatRupiah, periodLabel, todayISO } from '@/utils/formatters'
import AppModal from '@/components/AppModal.vue'
import FormLabel from '@/components/FormLabel.vue'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps({ bill: { type: Object, default: null } })
const emit = defineEmits(['saved'])

const form = ref({ amount: 0, paid_at: todayISO(), note: '' })
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (isOpen && props.bill) {
    form.value = { amount: props.bill.outstanding, paid_at: todayISO(), note: '' }
    error.value = ''
  }
})

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    await billingService.pay(props.bill.id, {
      amount: Number(form.value.amount),
      paid_at: form.value.paid_at || undefined,
      note: form.value.note,
    })
    open.value = false
    emit('saved', `Pembayaran ${props.bill.no_rumah} ${formatRupiah(form.value.amount)} dicatat.`)
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
    title="Catat pembayaran"
    :subtitle="
      bill ? `Rumah ${bill.no_rumah} · ${bill.owner_name} · ${periodLabel(bill.period)}` : ''
    "
  >
    <form v-if="bill" id="payment-form" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center text-xs">
        <div>
          <p class="text-gray-500">Tagihan</p>
          <p class="font-bold">{{ formatRupiah(bill.amount) }}</p>
        </div>
        <div>
          <p class="text-gray-500">Dibayar</p>
          <p class="font-bold">{{ formatRupiah(bill.paid) }}</p>
        </div>
        <div>
          <p class="text-gray-500">Sisa</p>
          <p class="font-bold text-red-600">{{ formatRupiah(bill.outstanding) }}</p>
        </div>
      </div>

      <div>
        <FormLabel for="pay-amount" required>Nominal dibayar</FormLabel>
        <div class="flex gap-2">
          <input
            id="pay-amount"
            v-model="form.amount"
            type="number"
            min="1"
            :max="bill.outstanding"
            class="input"
            required
          />
          <button
            type="button"
            class="btn btn-ghost shrink-0"
            @click="form.amount = bill.outstanding"
          >
            Lunas
          </button>
        </div>
      </div>

      <div>
        <FormLabel for="pay-date">Tanggal bayar</FormLabel>
        <input id="pay-date" v-model="form.paid_at" type="date" class="input" />
      </div>

      <div>
        <FormLabel for="pay-note">Catatan (opsional)</FormLabel>
        <input
          id="pay-note"
          v-model="form.note"
          class="input"
          placeholder="mis. transfer / tunai"
        />
      </div>

      <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
      <button type="submit" form="payment-form" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Menyimpan…' : 'Simpan pembayaran' }}
      </button>
    </template>
  </AppModal>
</template>

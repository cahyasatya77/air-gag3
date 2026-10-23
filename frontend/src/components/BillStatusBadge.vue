<script setup>
import { computed } from 'vue'
import { formatRupiah } from '@/utils/formatters'

const props = defineProps({ bill: { type: Object, required: true } })

const status = computed(() => {
  const b = props.bill
  if (!b.recorded_at) return { cls: 'badge-gray', text: 'Belum dicatat' }
  if (b.outstanding <= 0) return { cls: 'badge-green', text: 'Lunas' }
  if (b.paid > 0) return { cls: 'badge-amber', text: `Kurang ${formatRupiah(b.outstanding)}` }
  return { cls: 'badge-red', text: 'Belum bayar' }
})
</script>

<template>
  <span class="badge" :class="status.cls">{{ status.text }}</span>
</template>

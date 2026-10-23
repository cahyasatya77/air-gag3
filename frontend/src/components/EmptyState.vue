<script setup>
import { Inbox, Loader2 } from '@lucide/vue'

defineProps({
  loading: { type: Boolean, default: false },
  message: { type: String, default: 'Tidak ada data.' },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-4 py-12 text-sm text-gray-500">
    <Loader2 v-if="loading" class="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
    <Inbox v-else class="h-6 w-6 text-gray-300" aria-hidden="true" />
    <p>{{ loading ? 'Memuat data…' : message }}</p>
  </div>
</template>

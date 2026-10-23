<script setup>
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { periodLabel, shiftPeriod } from '@/utils/formatters'

const period = defineModel({ type: String, required: true })
</script>

<template>
  <div class="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1">
    <button
      type="button"
      aria-label="Bulan sebelumnya"
      class="cursor-pointer rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
      @click="period = shiftPeriod(period, -1)"
    >
      <ChevronLeft class="h-4 w-4" aria-hidden="true" />
    </button>

    <label
      class="relative min-w-36 cursor-pointer px-2 text-center text-sm font-semibold text-gray-800"
    >
      {{ periodLabel(period) }}
      <input
        v-model="period"
        type="month"
        aria-label="Pilih bulan"
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        @click="$event.target.showPicker?.()"
      />
    </label>

    <button
      type="button"
      aria-label="Bulan berikutnya"
      class="cursor-pointer rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
      @click="period = shiftPeriod(period, 1)"
    >
      <ChevronRight class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
</template>

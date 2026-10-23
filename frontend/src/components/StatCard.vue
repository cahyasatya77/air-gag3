<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  tone: {
    type: String,
    default: 'blue',
    validator: (v) => ['blue', 'green', 'amber', 'red'].includes(v),
  },
})

const TONES = {
  blue: 'bg-brand-50 text-brand-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
}
</script>

<template>
  <div class="card flex items-start gap-3 p-4">
    <div v-if="icon" class="shrink-0 rounded-lg p-2.5" :class="TONES[tone]">
      <component :is="icon" class="h-5 w-5" aria-hidden="true" />
    </div>
    <div class="min-w-0">
      <p class="text-xs font-medium text-gray-500">{{ label }}</p>
      <p class="mt-0.5 truncate text-xl font-bold text-gray-900 tabular-nums">{{ value }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-gray-500">{{ hint }}</p>
    </div>
  </div>
</template>

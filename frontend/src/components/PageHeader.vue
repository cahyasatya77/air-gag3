<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col justify-between gap-3 md:flex-row md:items-center">
    <div>
      <h1 class="text-xl font-bold text-gray-900">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-xs text-gray-500">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2"><slot /></div>
  </div>
</template>

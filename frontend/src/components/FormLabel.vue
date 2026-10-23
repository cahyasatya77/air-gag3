<script setup>
import { computed } from 'vue'
import { Info } from '@lucide/vue'

const props = defineProps({
  for: { type: String, default: '' },

  required: { type: Boolean, default: false },

  hint: { type: String, default: '' },

  tooltip: { type: String, default: '' },

  hintInline: { type: Boolean, default: false },
})

const htmlFor = computed(() => props.for || undefined)
const resolvedHint = computed(() => props.hint || props.tooltip || '')
const hintId = computed(() => (htmlFor.value ? `${htmlFor.value}-hint` : undefined))
</script>

<template>
  <div>
    <label
      :for="htmlFor"
      class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2"
    >
      <slot />

      <template v-if="required">
        <span class="text-red-500 ml-0.5" aria-hidden="true">*</span>
      </template>

      <span
        v-if="resolvedHint && !hintInline"
        class="inline-flex align-middle ml-1 text-gray-400 cursor-help"
        :title="resolvedHint"
      >
        <Info class="w-3.5 h-3.5" aria-hidden="true" />
        <span class="sr-only">{{ resolvedHint }}</span>
      </span>
    </label>

    <p
      v-if="resolvedHint && hintInline"
      :id="hintId"
      class="-mt-1 mb-2 text-[11px] text-gray-500 leading-relaxed normal-case"
    >
      {{ resolvedHint }}
    </p>
  </div>
</template>

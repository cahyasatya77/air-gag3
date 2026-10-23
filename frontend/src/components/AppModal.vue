<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { X } from '@lucide/vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
})
const emit = defineEmits(['update:modelValue'])

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }
const close = () => emit('update:modelValue', false)

const onKeydown = (event) => {
  if (event.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4"
        @mousedown.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          :class="SIZES[size]"
        >
          <header class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div class="min-w-0">
              <h2 class="text-base font-bold text-gray-900">{{ title }}</h2>
              <p v-if="subtitle" class="mt-0.5 text-xs text-gray-500">{{ subtitle }}</p>
            </div>
            <button
              type="button"
              aria-label="Tutup"
              class="-mt-1 -mr-1 cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              @click="close"
            >
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-4"><slot /></div>

          <footer
            v-if="$slots.footer"
            class="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

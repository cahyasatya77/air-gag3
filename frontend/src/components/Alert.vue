<script setup>
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { Check, CircleAlert, X } from '@lucide/vue'

const props = defineProps({
  success: { type: String, default: '' },
  error: { type: String, default: '' },
  duration: { type: Number, default: 5000 },
  max: { type: Number, default: 4 },
  position: {
    type: String,
    default: 'top-right',
    validator: (v) => ['top-right', 'top-center', 'bottom-right'].includes(v),
  },
})

const emit = defineEmits(['update:success', 'update:error', 'dismiss'])

const VARIANTS = {
  success: {
    icon: Check,
    icon_class: 'text-green-500',
    text_class: 'text-green-800',
    border_class: 'border-l-green-500',
    bar_class: 'bg-green-500',
    role: 'status',
    live: 'polite',
    close_class: 'text-green-400 hover:text-green-700 focus:ring-green-400',
  },
  error: {
    icon: CircleAlert,
    icon_class: 'text-red-500',
    text_class: 'text-red-800',
    border_class: 'border-l-red-500',
    bar_class: 'bg-red-500',
    role: 'alert',
    live: 'assertive',
    close_class: 'text-red-400 hover:text-red-700 focus:ring-red-400',
  },
}

const POSITIONS = {
  'top-right': 'top-20 right-6 items-end',
  'top-center': 'top-6 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-6 right-6 items-end',
}

const positionClass = computed(() => POSITIONS[props.position] ?? POSITIONS['top-right'])
const isBottom = computed(() => props.position.startsWith('bottom'))

let seq = 0
const items = ref([])

const remove = (id, notify = true) => {
  const index = items.value.findIndex((item) => item.id === id)
  if (index === -1) return

  const [removed] = items.value.splice(index, 1)
  if (removed.timer) clearTimeout(removed.timer)

  if (notify) {
    emit(`update:${removed.type}`, '')
    emit('dismiss', { type: removed.type, message: removed.message })
  }
}

const startTimer = (item) => {
  if (!item.duration) return
  item.startedAt = Date.now()
  item.timer = setTimeout(() => remove(item.id), item.remaining)
}

const pause = (item) => {
  if (!item.duration || item.paused) return
  clearTimeout(item.timer)
  item.timer = null
  item.remaining = Math.max(0, item.remaining - (Date.now() - item.startedAt))
  item.paused = true
}

const resume = (item) => {
  if (!item.duration || !item.paused) return
  item.paused = false
  startTimer(item)
}

const push = (type, message) => {
  const item = {
    id: ++seq,
    type,
    message,
    duration: props.duration,
    remaining: props.duration,
    startedAt: 0,
    paused: false,
    timer: null,
  }

  items.value.push(item)

  while (items.value.length > props.max) {
    remove(items.value[0].id, false)
  }

  startTimer(item)
}

watch(
  () => props.success,
  (value) => {
    if (value) push('success', value)
  },
  { immediate: true },
)

watch(
  () => props.error,
  (value) => {
    if (value) push('error', value)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  items.value.forEach((item) => item.timer && clearTimeout(item.timer))
  items.value = []
})

defineExpose({ clear: () => items.value.slice().forEach((item) => remove(item.id, false)) })
</script>

<template>
  <div
    class="fixed z-100 flex flex-col gap-3 w-full max-w-sm px-4 sm:px-0 pointer-events-none"
    :class="[positionClass, isBottom ? 'flex-col-reverse' : 'flex-col']"
  >
    <TransitionGroup
      enter-active-class="transform transition duration-300 ease-out"
      enter-from-class="translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transform transition duration-200 ease-in absolute"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-full opacity-0"
      move-class="transition duration-200 ease-out"
    >
      <div
        v-for="item in items"
        :key="item.id"
        :role="VARIANTS[item.type].role"
        :aria-live="VARIANTS[item.type].live"
        class="pointer-events-auto relative w-full overflow-hidden bg-white border-l-4 rounded-lg shadow-xl"
        :class="[VARIANTS[item.type].border_class, VARIANTS[item.type].text_class]"
        @mouseenter="pause(item)"
        @mouseleave="resume(item)"
        @focusin="pause(item)"
        @focusout="resume(item)"
      >
        <div class="flex items-start gap-2 p-4 pr-2 text-xs font-semibold">
          <component
            :is="VARIANTS[item.type].icon"
            class="w-4 h-4 shrink-0 mt-px"
            :class="VARIANTS[item.type].icon_class"
            aria-hidden="true"
          />

          <span class="flex-1 leading-relaxed wrap-break-words">{{ item.message }}</span>

          <button
            type="button"
            aria-label="Tutup notifikasi"
            class="shrink-0 -mt-1 p-1 rounded cursor-pointer transition-colors focus:outline-none focus:ring-2"
            :class="VARIANTS[item.type].close_class"
            @click="remove(item.id)"
          >
            <X class="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div v-if="item.duration" class="absolute bottom-0 left-0 h-0.5 w-full bg-black/5">
          <div
            class="alert-bar h-full origin-left"
            :class="[VARIANTS[item.type].bar_class, { 'alert-bar--paused': item.paused }]"
            :style="{ animationDuration: `${item.duration}ms` }"
          />
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.alert-bar {
  animation-name: alert-countdown;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

.alert-bar--paused {
  animation-play-state: paused;
}

@keyframes alert-countdown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .alert-bar {
    animation: none;
    transform: scaleX(1);
  }
}
</style>

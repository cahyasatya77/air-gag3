<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { CalendarDays, ChevronRight, MapPin, Plus } from '@lucide/vue'
import { notesService } from '@/services/notes'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import { formatDate } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'

const auth = useAuthStore()
const { sucMsg, errMsg, fail } = useNotify()

const notes = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    notes.value = await notesService.list()
  } catch (e) {
    fail(e, 'Gagal memuat notulen.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Notulen Pertemuan" subtitle="Hasil pertemuan warga Gang Alamanda setiap bulan.">
      <RouterLink v-if="auth.canManageNotes" to="/notulen/baru" class="btn btn-primary">
        <Plus class="h-4 w-4" aria-hidden="true" /> Notulen baru
      </RouterLink>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <EmptyState v-if="loading" loading />
    <EmptyState v-else-if="!notes.length" message="Belum ada notulen." />

    <ul v-else class="space-y-3">
      <li v-for="n in notes" :key="n.id">
        <RouterLink
          :to="`/notulen/${n.id}`"
          class="card flex items-center justify-between gap-4 p-4 transition hover:border-brand-500"
        >
          <div class="min-w-0">
            <p class="font-bold text-gray-900">{{ n.title }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span class="inline-flex items-center gap-1">
                <CalendarDays class="h-3.5 w-3.5" aria-hidden="true" />{{ formatDate(n.meeting_date) }}
              </span>
              <span v-if="n.location" class="inline-flex items-center gap-1">
                <MapPin class="h-3.5 w-3.5" aria-hidden="true" />{{ n.location }}
              </span>
              <span>{{ n.point_count }} poin</span>
            </p>
            <p v-if="n.point_titles.length" class="mt-2 truncate text-sm text-gray-600">
              {{ n.point_titles.join(' · ') }}<span v-if="n.point_count > 3"> …</span>
            </p>
          </div>
          <ChevronRight class="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

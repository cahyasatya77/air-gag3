<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CalendarDays, MapPin, Pencil, Trash2 } from '@lucide/vue'
import { notesService } from '@/services/notes'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import { formatDate } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { sucMsg, errMsg, fail, run } = useNotify()

const note = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    note.value = await notesService.get(route.params.id)
  } catch (e) {
    fail(e, 'Gagal memuat notulen.')
  } finally {
    loading.value = false
  }
})

const remove = async () => {
  if (!confirm(`Hapus notulen "${note.value.title}"? Tindakan ini tidak bisa dibatalkan.`)) return
  if (await run(() => notesService.remove(note.value.id))) router.replace('/notulen')
}
</script>

<template>
  <div class="space-y-5">
    <RouterLink to="/notulen" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
      <ArrowLeft class="h-4 w-4" aria-hidden="true" /> Semua notulen
    </RouterLink>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />
    <EmptyState v-if="loading" loading />

    <template v-else-if="note">
      <PageHeader :title="note.title">
        <template v-if="auth.canManageNotes">
          <RouterLink :to="`/notulen/${note.id}/ubah`" class="btn btn-ghost">
            <Pencil class="h-4 w-4" aria-hidden="true" /> Ubah
          </RouterLink>
          <button v-if="auth.isAdmin" type="button" class="btn btn-ghost text-red-600" @click="remove">
            <Trash2 class="h-4 w-4" aria-hidden="true" /> Hapus
          </button>
        </template>
      </PageHeader>

      <p class="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <span class="inline-flex items-center gap-1">
          <CalendarDays class="h-4 w-4" aria-hidden="true" />{{ formatDate(note.meeting_date) }}
        </span>
        <span v-if="note.location" class="inline-flex items-center gap-1">
          <MapPin class="h-4 w-4" aria-hidden="true" />{{ note.location }}
        </span>
      </p>

      <ol class="space-y-3">
        <li v-for="(p, i) in note.points" :key="p.id" class="card p-5">
          <h2 class="flex gap-3 text-base font-bold text-gray-900">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm text-brand-800"
            >{{ i + 1 }}</span>
            <span class="pt-0.5">{{ p.title }}</span>
          </h2>
          <!-- isi sudah disanitasi di server -->
          <div v-if="p.content" class="rich-content mt-3 pl-10" v-html="p.content" />
        </li>
      </ol>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from '@lucide/vue'
import { notesService } from '@/services/notes'
import { errorMessage } from '@/services/api'
import { todayISO } from '@/utils/formatters'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'
import RichEditor from '@/components/RichEditor.vue'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const editing = !!id

let uid = 0
const newPoint = (p = {}) => ({ key: ++uid, title: p.title ?? '', content: p.content ?? '' })

const form = ref({ title: '', meeting_date: todayISO(), location: '', points: [newPoint()] })
const titleTouched = ref(editing)
const loading = ref(editing)
const saving = ref(false)
const error = ref('')

const defaultTitle = (iso) => {
  const [y, m, d] = iso.split('-')
  return `Notulensi ${d}/${m}/${y}`
}
if (!editing) form.value.title = defaultTitle(form.value.meeting_date)
// Judul otomatis mengikuti tanggal selama belum diubah manual
watch(
  () => form.value.meeting_date,
  (d) => {
    if (!titleTouched.value && d) form.value.title = defaultTitle(d)
  },
)

onMounted(async () => {
  if (!editing) return
  try {
    const n = await notesService.get(id)
    form.value = {
      title: n.title,
      meeting_date: n.meeting_date.slice(0, 10),
      location: n.location,
      points: n.points.map(newPoint),
    }
  } catch (e) {
    error.value = errorMessage(e, 'Gagal memuat notulen.')
  } finally {
    loading.value = false
  }
})

const addPoint = () => form.value.points.push(newPoint())
const removePoint = (i) => {
  if (form.value.points.length > 1) form.value.points.splice(i, 1)
}
const move = (i, d) => {
  const list = form.value.points
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}

const valid = computed(
  () =>
    form.value.title.trim() &&
    form.value.meeting_date &&
    form.value.points.length &&
    form.value.points.every((p) => p.title.trim()),
)

const submit = async () => {
  if (!valid.value) {
    error.value = 'Judul, tanggal, dan judul setiap poin wajib diisi.'
    return
  }
  saving.value = true
  error.value = ''
  const body = {
    title: form.value.title,
    meeting_date: form.value.meeting_date,
    location: form.value.location,
    points: form.value.points.map((p) => ({ title: p.title, content: p.content })),
  }
  try {
    const saved = editing ? await notesService.update(id, body) : await notesService.create(body)
    router.replace(`/notulen/${saved.id}`)
  } catch (e) {
    error.value = errorMessage(e, 'Gagal menyimpan notulen.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <RouterLink
      :to="editing ? `/notulen/${id}` : '/notulen'"
      class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
    >
      <ArrowLeft class="h-4 w-4" aria-hidden="true" /> Kembali
    </RouterLink>
    <PageHeader
      :title="editing ? 'Ubah notulen' : 'Notulen baru'"
      subtitle="Tulis hasil pertemuan per poin. Setiap poin punya judul dan isi (daftar, cetak tebal, dll.)."
    />

    <EmptyState v-if="loading" loading />
    <form v-else class="space-y-5" @submit.prevent="submit">
      <div class="card grid gap-4 p-5 md:grid-cols-3">
        <div class="md:col-span-2">
          <FormLabel for="n-title" required>Judul</FormLabel>
          <input
            id="n-title"
            v-model="form.title"
            class="input"
            maxlength="200"
            required
            @input="titleTouched = true"
          />
        </div>
        <div>
          <FormLabel for="n-date" required>Tanggal pertemuan</FormLabel>
          <input id="n-date" v-model="form.meeting_date" type="date" class="input" required />
        </div>
        <div class="md:col-span-3">
          <FormLabel for="n-loc">Lokasi (opsional)</FormLabel>
          <input
            id="n-loc"
            v-model="form.location"
            class="input"
            maxlength="200"
            placeholder="mis. Fasum Gang Alamanda"
          />
        </div>
      </div>

      <div v-for="(p, i) in form.points" :key="p.key" class="card space-y-3 p-5">
        <div class="flex items-center gap-2">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
          >{{ i + 1 }}</span>
          <input
            v-model="p.title"
            class="input font-semibold"
            maxlength="255"
            placeholder="Judul poin, mis. Retribusi air"
            :aria-label="`Judul poin ${i + 1}`"
            required
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="i === 0"
            aria-label="Naikkan poin"
            @click="move(i, -1)"
          >
            <ArrowUp class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="i === form.points.length - 1"
            aria-label="Turunkan poin"
            @click="move(i, 1)"
          >
            <ArrowDown class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm text-red-600"
            :disabled="form.points.length === 1"
            aria-label="Hapus poin"
            @click="removePoint(i)"
          >
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <RichEditor v-model="p.content" />
      </div>

      <button type="button" class="btn btn-ghost" @click="addPoint">
        <Plus class="h-4 w-4" aria-hidden="true" /> Tambah poin
      </button>

      <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>

      <div class="flex justify-end gap-2 border-t border-gray-200 pt-4">
        <RouterLink :to="editing ? `/notulen/${id}` : '/notulen'" class="btn btn-ghost">Batal</RouterLink>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'Menyimpan…' : 'Simpan notulen' }}
        </button>
      </div>
    </form>
  </div>
</template>

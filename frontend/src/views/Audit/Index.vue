<script setup>
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Search } from '@lucide/vue'
import { masterService } from '@/services/master'
import { useNotify } from '@/composables/useNotify'
import { formatDateTime } from '@/utils/formatters'
import Alert from '@/components/Alert.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'

const { sucMsg, errMsg, fail } = useNotify()

const logs = ref([])
const loading = ref(false)
const search = ref('')

const load = async () => {
  loading.value = true
  try {
    logs.value = await masterService.audit(300)
  } catch (e) {
    fail(e, 'Gagal memuat audit log.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return logs.value.filter(
    (l) => !q || `${l.username} ${l.action} ${l.entity} ${l.entity_id}`.toLowerCase().includes(q),
  )
})

const short = (value) => (value ? JSON.stringify(value) : '')
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Audit Log" subtitle="Jejak semua perubahan penting (300 terbaru).">
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Cari user / aksi / objek"
          aria-label="Cari"
          class="input w-full pl-9 sm:w-64"
        />
      </div>
      <button type="button" class="btn btn-ghost" aria-label="Muat ulang" @click="load">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !logs.length" loading />
      <EmptyState v-else-if="!rows.length" message="Tidak ada catatan." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Waktu</th>
            <th class="th">User</th>
            <th class="th">Aksi</th>
            <th class="th">Objek</th>
            <th class="th">Sebelum</th>
            <th class="th">Sesudah</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in rows" :key="l.id" class="align-top">
            <td class="td whitespace-nowrap text-xs">{{ formatDateTime(l.created_at) }}</td>
            <td class="td">{{ l.username || '-' }}</td>
            <td class="td">
              <span class="badge badge-blue">{{ l.action }}</span>
            </td>
            <td class="td whitespace-nowrap">{{ l.entity }} {{ l.entity_id }}</td>
            <td class="td max-w-64">
              <code class="block truncate text-[11px] text-gray-500" :title="short(l.before)">{{
                short(l.before)
              }}</code>
            </td>
            <td class="td max-w-64">
              <code class="block truncate text-[11px] text-gray-700" :title="short(l.after)">{{
                short(l.after)
              }}</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

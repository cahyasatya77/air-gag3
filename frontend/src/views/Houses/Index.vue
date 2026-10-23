<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus, Search, SquarePen } from '@lucide/vue'
import { masterService } from '@/services/master'
import { errorMessage } from '@/services/api'
import { useNotify } from '@/composables/useNotify'
import Alert from '@/components/Alert.vue'
import AppModal from '@/components/AppModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'

const STATUS = {
  normal: { label: 'Normal', cls: 'badge-green' },
  tidak_pakai: { label: 'Tidak pakai air (flat)', cls: 'badge-blue' },
  nonaktif: { label: 'Nonaktif', cls: 'badge-gray' },
}

const { sucMsg, errMsg, ok, fail } = useNotify()

const houses = ref([])
const users = ref([])
const loading = ref(false)
const search = ref('')
const statusFilter = ref('active')

const load = async () => {
  loading.value = true
  try {
    ;[houses.value, users.value] = await Promise.all([
      masterService.houses(),
      masterService.users(),
    ])
  } catch (e) {
    fail(e, 'Gagal memuat data rumah.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return houses.value.filter(
    (h) =>
      (statusFilter.value === 'all' ||
        (statusFilter.value === 'active'
          ? h.status !== 'nonaktif'
          : h.status === statusFilter.value)) &&
      (!q || `${h.no_rumah} ${h.owner_name} ${h.phone}`.toLowerCase().includes(q)),
  )
})

const owners = computed(() => users.value.filter((u) => u.roles.includes('pemilik')))

const open = ref(false)
const editing = ref(null)
const saving = ref(false)
const error = ref('')
const form = ref({})

const openForm = (house = null) => {
  editing.value = house
  form.value = house
    ? { ...house, user_id: house.user_id ?? '' }
    : { no_rumah: '', owner_name: '', phone: '', status: 'normal', notes: '', user_id: '' }
  error.value = ''
  open.value = true
}

const submit = async () => {
  saving.value = true
  error.value = ''
  try {
    const body = {
      owner_name: form.value.owner_name,
      phone: form.value.phone,
      status: form.value.status,
      notes: form.value.notes,
    }
    if (editing.value) {
      await masterService.updateHouse(editing.value.id, {
        ...body,
        user_id: form.value.user_id === '' ? null : Number(form.value.user_id),
      })
    } else {
      await masterService.createHouse({ ...body, no_rumah: form.value.no_rumah })
    }
    open.value = false
    ok(editing.value ? 'Data rumah diperbarui.' : 'Rumah ditambahkan.')
    load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Data Rumah" :subtitle="`${rows.length} rumah ditampilkan`">
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Cari no / nama / WA"
          aria-label="Cari"
          class="input w-full pl-9 sm:w-60"
        />
      </div>
      <select v-model="statusFilter" class="input w-auto" aria-label="Filter status">
        <option value="active">Aktif saja</option>
        <option value="all">Semua</option>
        <option value="nonaktif">Nonaktif</option>
        <option value="tidak_pakai">Flat</option>
      </select>
      <button type="button" class="btn btn-primary" @click="openForm()">
        <Plus class="h-4 w-4" aria-hidden="true" /> Rumah
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !houses.length" loading />
      <EmptyState v-else-if="!rows.length" message="Tidak ada rumah." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">No</th>
            <th class="th">Pemilik</th>
            <th class="th">Status</th>
            <th class="th">No. WhatsApp</th>
            <th class="th">Akun</th>
            <th class="th">Catatan</th>
            <th class="th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in rows" :key="h.id">
            <td class="td font-bold">{{ h.no_rumah }}</td>
            <td class="td">{{ h.owner_name }}</td>
            <td class="td">
              <span class="badge" :class="STATUS[h.status].cls">{{ STATUS[h.status].label }}</span>
            </td>
            <td class="td tabular-nums">{{ h.phone || '-' }}</td>
            <td class="td text-gray-600">{{ h.user_username || '-' }}</td>
            <td class="td max-w-56 truncate text-gray-600" :title="h.notes">{{ h.notes }}</td>
            <td class="td text-right">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :aria-label="`Ubah ${h.no_rumah}`"
                @click="openForm(h)"
              >
                <SquarePen class="h-3.5 w-3.5" aria-hidden="true" /> Ubah
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal v-model="open" :title="editing ? `Ubah rumah ${editing.no_rumah}` : 'Tambah rumah'">
      <form id="house-form" class="space-y-4" @submit.prevent="submit">
        <div v-if="!editing">
          <FormLabel for="h-no" required>No rumah</FormLabel>
          <input id="h-no" v-model="form.no_rumah" class="input" placeholder="mis. A88" required />
        </div>
        <div>
          <FormLabel for="h-owner">Nama pemilik</FormLabel>
          <input id="h-owner" v-model="form.owner_name" class="input" />
        </div>
        <div>
          <FormLabel for="h-phone" hint="Dipakai untuk mengirim tagihan lewat WhatsApp"
            >No. WhatsApp</FormLabel
          >
          <input
            id="h-phone"
            v-model="form.phone"
            type="tel"
            class="input"
            placeholder="081234567890"
          />
        </div>
        <div>
          <FormLabel for="h-status">Status</FormLabel>
          <select id="h-status" v-model="form.status" class="input">
            <option v-for="(s, key) in STATUS" :key="key" :value="key">{{ s.label }}</option>
          </select>
        </div>
        <div v-if="editing">
          <FormLabel for="h-user" hint="Akun pemilik yang bisa melihat tagihan rumah ini"
            >Akun login</FormLabel
          >
          <select id="h-user" v-model="form.user_id" class="input">
            <option value="">- tidak ada -</option>
            <option v-for="u in owners" :key="u.id" :value="u.id">
              {{ u.username }} ({{ u.name }})
            </option>
          </select>
        </div>
        <div>
          <FormLabel for="h-notes">Catatan</FormLabel>
          <textarea id="h-notes" v-model="form.notes" rows="2" class="input" />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="house-form" class="btn btn-primary" :disabled="saving">
          Simpan
        </button>
      </template>
    </AppModal>
  </div>
</template>

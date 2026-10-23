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

const ROLES = {
  administrator: { label: 'Administrator', cls: 'badge-blue' },
  pengurus: { label: 'Pengurus', cls: 'badge-amber' },
  pemilik: { label: 'Pemilik rumah', cls: 'badge-gray' },
}

const { sucMsg, errMsg, ok, fail } = useNotify()

const users = ref([])
const loading = ref(false)
const search = ref('')
const roleFilter = ref('all')

const load = async () => {
  loading.value = true
  try {
    users.value = await masterService.users()
  } catch (e) {
    fail(e, 'Gagal memuat pengguna.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return users.value.filter(
    (u) =>
      (roleFilter.value === 'all' || u.roles.includes(roleFilter.value)) &&
      (!q || `${u.username} ${u.name} ${u.houses.join(' ')}`.toLowerCase().includes(q)),
  )
})

const open = ref(false)
const editing = ref(null)
const saving = ref(false)
const error = ref('')
const form = ref({})

const openForm = (user = null) => {
  editing.value = user
  form.value = user
    ? { name: user.name, roles: [...user.roles], active: user.active, password: '' }
    : { username: '', name: '', roles: ['pengurus'], password: '' }
  error.value = ''
  open.value = true
}

const submit = async () => {
  if (!form.value.roles.length) {
    error.value = 'Pilih minimal satu peran.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (editing.value) {
      const body = { name: form.value.name, roles: form.value.roles, active: form.value.active }
      if (form.value.password) body.password = form.value.password
      await masterService.updateUser(editing.value.id, body)
    } else {
      await masterService.createUser(form.value)
    }
    open.value = false
    ok(editing.value ? 'Pengguna diperbarui.' : 'Pengguna ditambahkan.')
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
    <PageHeader
      title="Pengguna"
      subtitle="Akun pemilik dihubungkan ke rumahnya lewat menu Data Rumah."
    >
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Cari nama / username / rumah"
          aria-label="Cari"
          class="input w-full pl-9 sm:w-64"
        />
      </div>
      <select v-model="roleFilter" class="input w-auto" aria-label="Filter peran">
        <option value="all">Semua peran</option>
        <option v-for="(r, key) in ROLES" :key="key" :value="key">{{ r.label }}</option>
      </select>
      <button type="button" class="btn btn-primary" @click="openForm()">
        <Plus class="h-4 w-4" aria-hidden="true" /> Pengguna
      </button>
    </PageHeader>

    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <div class="card overflow-x-auto">
      <EmptyState v-if="loading && !users.length" loading />
      <EmptyState v-else-if="!rows.length" message="Tidak ada pengguna." />
      <table v-else class="w-full">
        <thead>
          <tr>
            <th class="th">Username</th>
            <th class="th">Nama</th>
            <th class="th">Peran</th>
            <th class="th">Rumah</th>
            <th class="th">Status</th>
            <th class="th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in rows" :key="u.id">
            <td class="td font-medium">{{ u.username }}</td>
            <td class="td">{{ u.name }}</td>
            <td class="td">
              <div class="flex flex-wrap gap-1">
                <span v-for="r in u.roles" :key="r" class="badge" :class="ROLES[r].cls">{{
                  ROLES[r].label
                }}</span>
              </div>
            </td>
            <td class="td text-gray-600">{{ u.houses.join(', ') || '-' }}</td>
            <td class="td">
              <span class="badge" :class="u.active ? 'badge-green' : 'badge-gray'">{{
                u.active ? 'Aktif' : 'Nonaktif'
              }}</span>
            </td>
            <td class="td text-right">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :aria-label="`Ubah ${u.username}`"
                @click="openForm(u)"
              >
                <SquarePen class="h-3.5 w-3.5" aria-hidden="true" /> Ubah
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppModal v-model="open" :title="editing ? `Ubah ${editing.username}` : 'Tambah pengguna'">
      <form id="user-form" class="space-y-4" @submit.prevent="submit">
        <div v-if="!editing">
          <FormLabel for="u-username" required>Username</FormLabel>
          <input id="u-username" v-model="form.username" class="input" minlength="3" required />
        </div>
        <div>
          <FormLabel for="u-name" required>Nama</FormLabel>
          <input id="u-name" v-model="form.name" class="input" required />
        </div>
        <fieldset>
          <FormLabel>Peran (boleh lebih dari satu)</FormLabel>
          <div class="space-y-1.5 rounded-lg border border-gray-200 p-3">
            <label
              v-for="(r, key) in ROLES"
              :key="key"
              class="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                v-model="form.roles"
                type="checkbox"
                :value="key"
                class="h-4 w-4 accent-brand-700"
              />
              <span class="badge" :class="r.cls">{{ r.label }}</span>
            </label>
          </div>
        </fieldset>
        <div v-if="editing">
          <FormLabel for="u-active">Status akun</FormLabel>
          <select id="u-active" v-model="form.active" class="input">
            <option :value="true">Aktif</option>
            <option :value="false">Nonaktif</option>
          </select>
        </div>
        <div>
          <FormLabel for="u-pass" :required="!editing">
            {{
              editing
                ? 'Reset password (kosongkan bila tidak diubah)'
                : 'Password (min. 8 karakter)'
            }}
          </FormLabel>
          <input
            id="u-pass"
            v-model="form.password"
            type="password"
            class="input"
            minlength="8"
            :required="!editing"
            autocomplete="new-password"
          />
        </div>
        <p v-if="error" class="text-sm font-medium text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="open = false">Batal</button>
        <button type="submit" form="user-form" class="btn btn-primary" :disabled="saving">
          Simpan
        </button>
      </template>
    </AppModal>
  </div>
</template>

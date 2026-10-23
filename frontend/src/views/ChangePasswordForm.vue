<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import Alert from '@/components/Alert.vue'
import FormLabel from '@/components/FormLabel.vue'
import PageHeader from '@/components/PageHeader.vue'

const auth = useAuthStore()
const { sucMsg, errMsg, run, fail } = useNotify()

const form = ref({ old: '', next: '', confirm: '' })
const saving = ref(false)

const submit = async () => {
  if (form.value.next !== form.value.confirm) return fail('Konfirmasi password tidak sama.')
  saving.value = true
  const ok = await run(
    () => auth.changePassword(form.value.old, form.value.next),
    'Password berhasil diubah.',
  )
  saving.value = false
  if (ok) form.value = { old: '', next: '', confirm: '' }
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Ganti Password" subtitle="Gunakan minimal 8 karakter yang sulit ditebak." />
    <Alert v-model:success="sucMsg" v-model:error="errMsg" />

    <form class="card max-w-md space-y-4 p-5" @submit.prevent="submit">
      <div>
        <FormLabel for="old">Password lama</FormLabel>
        <input
          id="old"
          v-model="form.old"
          type="password"
          class="input"
          autocomplete="current-password"
          required
        />
      </div>
      <div>
        <FormLabel for="next">Password baru</FormLabel>
        <input
          id="next"
          v-model="form.next"
          type="password"
          class="input"
          minlength="8"
          autocomplete="new-password"
          required
        />
      </div>
      <div>
        <FormLabel for="confirm">Ulangi password baru</FormLabel>
        <input
          id="confirm"
          v-model="form.confirm"
          type="password"
          class="input"
          minlength="8"
          autocomplete="new-password"
          required
        />
      </div>
      <button type="submit" class="btn btn-primary" :disabled="saving">Simpan password</button>
    </form>
  </div>
</template>

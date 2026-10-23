<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Droplets, Eye, EyeOff, Loader2 } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useNotify } from '@/composables/useNotify'
import Alert from '@/components/Alert.vue'
import FormLabel from '@/components/FormLabel.vue'

const auth = useAuthStore()
const router = useRouter()
const { errMsg, fail } = useNotify()

const appName = import.meta.env.VITE_APP_NAME
const appSubtitle = import.meta.env.VITE_APP_SUBTITLE

const form = ref({ username: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)

const submit = async () => {
  loading.value = true
  try {
    await auth.login({ username: form.value.username.trim(), password: form.value.password })
    router.replace(auth.homePath)
  } catch (e) {
    fail(e, 'Login gagal. Periksa username dan password.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="flex min-h-dvh items-center justify-center bg-linear-to-br from-brand-50 to-white p-4"
  >
    <Alert v-model:error="errMsg" position="top-center" />

    <div class="w-full max-w-sm">
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md"
        >
          <Droplets class="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 class="text-xl font-bold text-gray-900">{{ appName }}</h1>
        <p class="text-sm text-gray-500">{{ appSubtitle }}</p>
      </div>

      <form class="card space-y-4 p-6" @submit.prevent="submit">
        <div>
          <FormLabel for="username">Username</FormLabel>
          <input
            id="username"
            v-model="form.username"
            class="input"
            autocomplete="username"
            placeholder="mis. a32"
            required
            autofocus
          />
        </div>

        <div>
          <FormLabel for="password">Password</FormLabel>
          <div class="relative">
            <input
              id="password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              class="input pr-10"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              :aria-label="showPassword ? 'Sembunyikan password' : 'Tampilkan password'"
              class="absolute inset-y-0 right-0 cursor-pointer px-3 text-gray-400 hover:text-gray-700"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="h-4 w-4" aria-hidden="true" />
              <Eye v-else class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          <Loader2 v-if="loading" class="h-4 w-4 animate-spin" aria-hidden="true" />
          {{ loading ? 'Memproses…' : 'Masuk' }}
        </button>
      </form>
    </div>
  </div>
</template>

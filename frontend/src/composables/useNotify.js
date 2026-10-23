import { ref } from 'vue'
import { errorMessage } from '@/services/api'

/**
 * Pesan sukses/error untuk komponen <Alert v-model:success v-model:error />.
 * `run(fn, sukses)` menjalankan aksi, menampilkan pesan, dan mengembalikan hasilnya
 * (atau undefined bila gagal).
 */
export function useNotify() {
  const sucMsg = ref('')
  const errMsg = ref('')

  const ok = (message) => {
    sucMsg.value = ''
    requestAnimationFrame(() => (sucMsg.value = message))
  }
  const fail = (error, fallback) => {
    const message = typeof error === 'string' ? error : errorMessage(error, fallback)
    errMsg.value = ''
    requestAnimationFrame(() => (errMsg.value = message))
  }
  const run = async (fn, success) => {
    try {
      const result = await fn()
      if (success) ok(success)
      return result ?? true
    } catch (e) {
      fail(e)
    }
  }

  return { sucMsg, errMsg, ok, fail, run }
}

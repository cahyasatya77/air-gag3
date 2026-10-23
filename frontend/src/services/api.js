import axios from 'axios'

const KEY_USER = 'user'
const LOGIN_PATH = '/login'

// Sesi memakai cookie httpOnly dari backend; yang disimpan di browser hanya profil user.
const api = axios.create({ baseURL: '/api', timeout: 30000 })

let sessionExpiredHandled = false

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = String(error?.config?.url ?? '')
    if (error?.response?.status === 401 && !url.includes('/auth/login')) {
      if (!sessionExpiredHandled && window.location.pathname !== LOGIN_PATH) {
        sessionExpiredHandled = true
        try {
          localStorage.removeItem(KEY_USER)
        } catch {
          /* abaikan */
        }
        const { useAuthStore } = await import('@/stores/auth')
        await useAuthStore().forceLogout()
      }
    }
    return Promise.reject(error)
  },
)

export const resetSessionGuard = () => {
  sessionExpiredHandled = false
}

/** Pesan error yang ramah dari respons API. */
export const errorMessage = (error, fallback = 'Terjadi kesalahan. Coba lagi.') =>
  error?.response?.data?.error ||
  (error?.code === 'ERR_NETWORK' ? 'Tidak dapat terhubung ke server.' : fallback)

export default api

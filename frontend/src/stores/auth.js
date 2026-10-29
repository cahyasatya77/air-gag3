import { defineStore } from 'pinia'
import api, { resetSessionGuard } from '@/services/api'

const KEY_USER = 'user'

const readUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem(KEY_USER) || 'null')
    // data sesi lama (satu peran) tidak dipakai lagi; user diminta login ulang
    return Array.isArray(user?.roles) ? user : null
  } catch {
    return null
  }
}
const writeUser = (user) => {
  try {
    if (user) localStorage.setItem(KEY_USER, JSON.stringify(user))
    else localStorage.removeItem(KEY_USER)
  } catch {
    /* abaikan */
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: readUser() }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    // Satu pengguna bisa punya banyak peran; menu & akses adalah gabungan semua perannya.
    roles: (state) => state.user?.roles ?? [],
    isAdmin() {
      return this.roles.includes('administrator')
    },
    isPengurus() {
      return this.roles.includes('pengurus')
    },
    isPemilik() {
      return this.roles.includes('pemilik')
    },
    /** Administrator & pengurus mengelola pencatatan, tagihan, dan kas semua dana. */
    isStaff() {
      return this.isAdmin || this.isPengurus
    },
    /** Staf + pengurus jimpitan/air: boleh pencatatan meteran & tagihan belum lunas. */
    isOps() {
      return this.isStaff || this.hasRole('pengurus_jimpitan', 'pengurus_air')
    },
    /** Membuat periode tagihan: administrator, pengurus, pengurus air (bukan pengurus jimpitan). */
    canCreatePeriod() {
      return this.isAdmin || this.hasRole('pengurus', 'pengurus_air')
    },
    /** Menulis/mengubah notulen pertemuan: administrator & pengurus. Semua pengguna login boleh membaca. */
    canManageNotes() {
      return this.isStaff
    },
    /** Kas & laporan kas satu dana ('jimpitan' | 'air'): staf penuh atau pengurus dana tersebut. */
    canFund() {
      return (fund) => this.isStaff || this.roles.includes(`pengurus_${fund}`)
    },
    displayName: (state) => state.user?.name || 'User',
    initial: (state) => (state.user?.name?.trim()?.[0] ?? 'U').toUpperCase(),
    hasRole() {
      return (...roles) => roles.flat().some((r) => this.roles.includes(r))
    },
    /** Halaman awal: Beranda untuk staf, Pencatatan untuk pengurus dana, Tagihan Saya bila hanya pemilik. */
    homePath() {
      if (this.isStaff) return '/'
      return this.isOps ? '/pencatatan' : '/tagihan-saya'
    },
  },

  actions: {
    async login(credentials) {
      const { data } = await api.post('/auth/login', credentials)
      this.user = data
      writeUser(data)
      resetSessionGuard()
      return data
    },

    async changePassword(oldPassword, newPassword) {
      await api.post('/me/password', { old_password: oldPassword, new_password: newPassword })
    },

    async logout() {
      try {
        await api.post('/auth/logout')
      } catch {
        /* sesi tetap dibersihkan di sisi browser */
      }
      await this.forceLogout()
    },

    async forceLogout() {
      this.user = null
      writeUser(null)
      const { default: router } = await import('@/router')
      await router.replace('/login')
    },
  },
})

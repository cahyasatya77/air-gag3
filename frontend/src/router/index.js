import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const STAFF = ['pengurus'] // administrator otomatis boleh ke semua halaman
const ADMIN_ONLY = ['administrator']
const OWNER = ['pemilik']
const STAFF_OWNER = ['pengurus', 'pemilik'] // laporan kas terbuka untuk pemilik (transparansi)

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginForm.vue'),
    meta: { requiresGuest: true, title: 'Masuk' },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Home/Index.vue'),
        meta: { title: 'Beranda', roles: STAFF },
      },
      {
        path: 'pencatatan',
        name: 'Readings',
        component: () => import('@/views/Readings/Index.vue'),
        meta: { title: 'Pencatatan Meteran', roles: STAFF },
      },
      {
        path: 'tunggakan',
        name: 'Receivables',
        component: () => import('@/views/Receivables/Index.vue'),
        meta: { title: 'Tagihan Belum Lunas', roles: STAFF },
      },
      { path: 'kas', redirect: '/kas/jimpitan' },
      {
        path: 'kas/jimpitan',
        name: 'CashJimpitan',
        component: () => import('@/views/Cash/Index.vue'),
        meta: { title: 'Kas Jimpitan', roles: STAFF, fund: 'jimpitan' },
      },
      {
        path: 'kas/air',
        name: 'CashAir',
        component: () => import('@/views/Cash/Index.vue'),
        meta: { title: 'Kas Air', roles: STAFF, fund: 'air' },
      },
      { path: 'laporan', redirect: '/laporan/jimpitan' },
      {
        path: 'laporan/jimpitan',
        name: 'ReportJimpitan',
        component: () => import('@/views/Reports/Index.vue'),
        meta: { title: 'Laporan Kas Jimpitan', roles: STAFF_OWNER, fund: 'jimpitan' },
      },
      {
        path: 'laporan/air',
        name: 'ReportAir',
        component: () => import('@/views/Reports/Index.vue'),
        meta: { title: 'Laporan Kas Air', roles: STAFF_OWNER, fund: 'air' },
      },
      {
        path: 'rumah',
        name: 'Houses',
        component: () => import('@/views/Houses/Index.vue'),
        meta: { title: 'Data Rumah', roles: ADMIN_ONLY },
      },
      {
        path: 'pengguna',
        name: 'Users',
        component: () => import('@/views/Users/Index.vue'),
        meta: { title: 'Pengguna', roles: ADMIN_ONLY },
      },
      {
        path: 'tarif',
        name: 'Tariffs',
        component: () => import('@/views/Tariffs/Index.vue'),
        meta: { title: 'Tarif', roles: ADMIN_ONLY },
      },
      {
        path: 'audit',
        name: 'Audit',
        component: () => import('@/views/Audit/Index.vue'),
        meta: { title: 'Audit Log', roles: ADMIN_ONLY },
      },
      {
        path: 'tagihan-saya',
        name: 'MyBills',
        component: () => import('@/views/MyBills/Index.vue'),
        meta: { title: 'Tagihan Saya', roles: OWNER },
      },
      {
        path: 'ganti-password',
        name: 'ChangePassword',
        component: () => import('@/views/ChangePasswordForm.vue'),
        meta: { title: 'Ganti Password' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Halaman tidak ditemukan' },
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuthStore()
  const appName = import.meta.env.VITE_APP_NAME

  document.title = to.meta.title ? `${to.meta.title} - ${appName}` : appName

  if (to.meta.requiresGuest && auth.isAuthenticated) return { path: auth.homePath }
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { path: '/login' }

  const roles = to.meta.roles
  if (Array.isArray(roles) && roles.length && !auth.isAdmin && !auth.hasRole(roles)) {
    return { path: auth.homePath }
  }
  return true
})

router.afterEach(() => {
  requestAnimationFrame(() => document.getElementById('app-main')?.scrollTo({ top: 0 }))
})

export default router

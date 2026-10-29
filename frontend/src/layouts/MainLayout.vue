<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  ChevronDown,
  ClipboardList,
  Droplets,
  FileText,
  History,
  Home,
  Lock,
  LogOut,
  Menu as MenuIcon,
  Receipt,
  ScrollText,
  Settings2,
  Users,
  Wallet,
  X,
  Building2,
  Landmark,
  NotebookText,
} from '@lucide/vue'

const auth = useAuthStore()
const route = useRoute()

const appName = import.meta.env.VITE_APP_NAME
const appSubtitle = import.meta.env.VITE_APP_SUBTITLE
const appVersion = import.meta.env.VITE_APP_VERSION

const ROLE_LABEL = {
  administrator: 'Administrator',
  pengurus: 'Pengurus',
  pengurus_jimpitan: 'Pengurus Jimpitan',
  pengurus_air: 'Pengurus Air',
  pemilik: 'Pemilik rumah',
}

const roleText = computed(() => auth.roles.map((r) => ROLE_LABEL[r]).join(' · '))

const REPORT_MENU = {
  name: 'Laporan Kas',
  icon: FileText,
  children: [
    { name: 'Laporan Jimpitan', path: '/laporan/jimpitan' },
    { name: 'Laporan Air', path: '/laporan/air' },
  ],
}

// Menu = gabungan semua peran pengguna. Tambah halaman baru cukup menambah satu baris di sini + satu route.
const menu = computed(() => {
  const groups = []
  if (auth.isPemilik) {
    groups.push({
      title: auth.isOps ? 'Rumah Saya' : '',
      items: [{ name: 'Tagihan Saya', path: '/tagihan-saya', icon: Receipt }],
    })
    // Pemilik non-staf membaca laporan kas kedua dana lewat grup transparansi; staf sudah punya di grup Keuangan
    if (!auth.isStaff) groups.push({ title: 'Transparansi', items: [REPORT_MENU] })
  }
  // Notulen pertemuan: dibaca semua pengguna login
  const info = { title: 'Informasi', items: [{ name: 'Notulen', path: '/notulen', icon: NotebookText }] }
  if (!auth.isOps) return [...groups, info]
  const operasional = [
    { name: 'Pencatatan Meteran', path: '/pencatatan', icon: ClipboardList },
    { name: 'Tagihan Belum Lunas', path: '/tunggakan', icon: History },
  ]
  if (auth.isStaff) operasional.unshift({ name: 'Beranda', path: '/', icon: Home })

  // Pengurus jimpitan/air hanya melihat kas & laporan dananya sendiri
  const funds = [
    { fund: 'jimpitan', kas: 'Kas Jimpitan', laporan: 'Laporan Jimpitan' },
    { fund: 'air', kas: 'Kas Air', laporan: 'Laporan Air' },
  ].filter((f) => auth.canFund(f.fund))
  const keuangan = [
    {
      name: 'Kas',
      icon: Wallet,
      children: funds.map((f) => ({ name: f.kas, path: `/kas/${f.fund}` })),
    },
  ]
  // Pemilik non-staf sudah punya laporan lengkap di grup Transparansi
  if (auth.isStaff || !auth.isPemilik) {
    keuangan.push({
      name: 'Laporan Kas',
      icon: FileText,
      children: funds.map((f) => ({ name: f.laporan, path: `/laporan/${f.fund}` })),
    })
  }
  const staffGroups = [{ title: 'Operasional', items: operasional }]
  if (funds.length) staffGroups.push({ title: 'Keuangan', items: keuangan })
  if (auth.isAdmin) {
    staffGroups.push({
      title: 'Pengaturan',
      items: [
        { name: 'Data Rumah', path: '/rumah', icon: Building2 },
        { name: 'Pengguna', path: '/pengguna', icon: Users },
        { name: 'Tarif', path: '/tarif', icon: Settings2 },
        { name: 'Rekening', path: '/rekening', icon: Landmark },
        { name: 'Audit Log', path: '/audit', icon: ScrollText },
      ],
    })
  }
  return [...staffGroups, ...groups, info]
})

const isActive = (path) => (path === '/' ? route.path === '/' : route.path.startsWith(path))
const isGroupActive = (item) => item.children?.some((c) => isActive(c.path)) ?? false

// Submenu: terbuka otomatis bila halaman anaknya sedang aktif
const openMenus = ref({})
const toggleMenu = (name) => (openMenus.value[name] = !openMenus.value[name])

// Sidebar: tetap terbuka di desktop (bisa disembunyikan), laci di mobile
const DESKTOP_QUERY = '(min-width: 768px)'
const SIDEBAR_KEY = 'air.sidebar.open'
const isDesktop = ref(true)
const desktopOpen = ref(true)
const mobileOpen = ref(false)
const profileOpen = ref(false)
const sidebarVisible = computed(() => (isDesktop.value ? desktopOpen.value : mobileOpen.value))

let mediaQuery = null
const syncDesktop = (e) => {
  isDesktop.value = e.matches
  if (e.matches) mobileOpen.value = false
}

const toggleSidebar = () => {
  if (isDesktop.value) {
    desktopOpen.value = !desktopOpen.value
    try {
      localStorage.setItem(SIDEBAR_KEY, desktopOpen.value ? '1' : '0')
    } catch {
      /* abaikan */
    }
  } else {
    mobileOpen.value = !mobileOpen.value
  }
}

const onKeydown = (e) => {
  if (e.key === 'Escape') {
    mobileOpen.value = false
    profileOpen.value = false
  }
}

watch(
  () => route.path,
  () => {
    mobileOpen.value = false
    profileOpen.value = false
    menu.value.forEach((g) =>
      g.items.forEach((item) => {
        if (isGroupActive(item)) openMenus.value[item.name] = true
      }),
    )
  },
  { immediate: true },
)

onMounted(() => {
  mediaQuery = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = mediaQuery.matches
  mediaQuery.addEventListener('change', syncDesktop)
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved !== null) desktopOpen.value = saved === '1'
  } catch {
    /* abaikan */
  }
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncDesktop)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-gray-50 font-sans">
    <header
      class="z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-xs sm:px-6"
    >
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Tampilkan atau sembunyikan menu"
          :aria-expanded="sidebarVisible"
          aria-controls="app-sidebar"
          class="shrink-0 cursor-pointer rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-700"
          @click="toggleSidebar"
        >
          <MenuIcon class="h-5 w-5" aria-hidden="true" />
        </button>

        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white"
        >
          <Droplets class="h-5 w-5" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-bold tracking-wide text-brand-800">{{ appName }}</h1>
          <p class="hidden truncate text-[11px] text-gray-500 sm:block">{{ appSubtitle }}</p>
        </div>
      </div>

      <div class="relative shrink-0">
        <div v-if="profileOpen" class="fixed inset-0 z-40" @click="profileOpen = false" />
        <button
          type="button"
          aria-label="Menu profil"
          :aria-expanded="profileOpen"
          class="relative z-50 flex cursor-pointer items-center gap-3 rounded-lg p-1.5 hover:bg-gray-50"
          @click="profileOpen = !profileOpen"
        >
          <div class="hidden border-r border-gray-200 pr-3 text-right sm:block">
            <p class="text-xs font-semibold text-gray-900">{{ auth.displayName }}</p>
            <p class="text-[10px] tracking-wider text-gray-400 uppercase">
              {{ roleText }}
            </p>
          </div>
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white"
          >
            {{ auth.initial }}
          </div>
          <ChevronDown
            class="hidden h-4 w-4 text-gray-500 transition-transform sm:block"
            :class="{ 'rotate-180': profileOpen }"
            aria-hidden="true"
          />
        </button>

        <div
          v-if="profileOpen"
          class="absolute top-full right-0 z-50 mt-2 w-52 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
        >
          <div class="px-4 py-2.5 sm:hidden">
            <p class="truncate text-xs font-semibold text-gray-900">{{ auth.displayName }}</p>
            <p class="text-[10px] tracking-wider text-gray-400 uppercase">
              {{ roleText }}
            </p>
          </div>
          <div class="py-1">
            <RouterLink
              to="/ganti-password"
              class="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Lock class="h-4 w-4 text-gray-400" aria-hidden="true" /> Ganti Password
            </RouterLink>
          </div>
          <div class="py-1">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
              @click="auth.logout()"
            >
              <LogOut class="h-4 w-4" aria-hidden="true" /> Keluar
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="relative flex flex-1 overflow-hidden">
      <div
        v-if="mobileOpen && !isDesktop"
        class="fixed inset-0 top-16 z-30 bg-gray-900/50 md:hidden"
        @click="mobileOpen = false"
      />

      <aside
        id="app-sidebar"
        :inert="!sidebarVisible"
        class="fixed inset-y-16 left-0 z-40 flex w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out md:static md:inset-auto md:translate-x-0 md:transition-[width]"
        :class="[
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          desktopOpen ? 'md:w-64' : 'md:w-0 md:border-r-0',
        ]"
      >
        <nav aria-label="Menu utama" class="flex-1 space-y-4 overflow-y-auto p-4 whitespace-nowrap">
          <div v-for="group in menu" :key="group.title">
            <p
              v-if="group.title"
              class="mb-1 px-3 text-[10px] font-bold tracking-wider text-gray-400 uppercase"
            >
              {{ group.title }}
            </p>
            <template v-for="item in group.items" :key="item.name">
              <div v-if="item.children">
                <button
                  type="button"
                  :aria-expanded="!!openMenus[item.name]"
                  class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                  :class="
                    isGroupActive(item)
                      ? 'font-semibold text-brand-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-brand-700'
                  "
                  @click="toggleMenu(item.name)"
                >
                  <component :is="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span class="flex-1 text-left">{{ item.name }}</span>
                  <ChevronDown
                    class="h-4 w-4 shrink-0 transition-transform"
                    :class="{ 'rotate-180': openMenus[item.name] }"
                    aria-hidden="true"
                  />
                </button>
                <div
                  v-show="openMenus[item.name]"
                  class="mt-1 ml-5 space-y-1 border-l-2 border-gray-100 pl-3"
                >
                  <RouterLink
                    v-for="child in item.children"
                    :key="child.path"
                    :to="child.path"
                    :aria-current="isActive(child.path) ? 'page' : undefined"
                    class="block rounded-lg px-3 py-2 text-sm transition-colors"
                    :class="
                      isActive(child.path)
                        ? 'bg-brand-50 font-semibold text-brand-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-brand-700'
                    "
                  >
                    {{ child.name }}
                  </RouterLink>
                </div>
              </div>

              <RouterLink
                v-else
                :to="item.path"
                :aria-current="isActive(item.path) ? 'page' : undefined"
                class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                :class="
                  isActive(item.path)
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-brand-700'
                "
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
                {{ item.name }}
              </RouterLink>
            </template>
          </div>
        </nav>

        <p
          class="shrink-0 border-t border-gray-200 p-4 text-center text-[10px] font-medium tracking-wider text-gray-400"
        >
          {{ appVersion }}
        </p>

        <button
          v-if="!isDesktop"
          type="button"
          aria-label="Tutup menu"
          class="absolute top-2 right-2 cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-gray-100"
          @click="mobileOpen = false"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>

      <main id="app-main" class="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div class="mx-auto max-w-7xl">
          <RouterView :key="route.path" />
        </div>
      </main>
    </div>
  </div>
</template>

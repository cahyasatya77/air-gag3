<script setup>
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
    <p class="text-5xl font-bold text-brand-700">404</p>
    <p class="text-gray-600">Halaman yang Anda cari tidak ditemukan.</p>
    <RouterLink :to="auth.isAuthenticated ? auth.homePath : '/login'" class="btn btn-primary">
      Kembali
    </RouterLink>
  </div>
</template>

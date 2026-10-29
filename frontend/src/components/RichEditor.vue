<script setup>
// Editor teks kaya (TinyMCE, self-hosted, lisensi GPL). Hanya dimuat di halaman yang memakainya.
import Editor from '@tinymce/tinymce-vue'
import 'tinymce/tinymce'
import 'tinymce/models/dom/model'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/skins/ui/oxide/skin.js'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/link'
import 'tinymce/skins/ui/oxide/content.js'
import 'tinymce/skins/content/default/content.js'

const model = defineModel({ type: String, default: '' })
defineProps({ height: { type: Number, default: 260 } })

const init = {
  license_key: 'gpl',
  // skin & CSS isi sudah ter-bundle lewat import di atas (terdaftar sebagai resource TinyMCE)
  skin: 'oxide',
  content_css: 'default',
  content_style: 'body { font-family: system-ui, sans-serif; font-size: 14px; }',
  menubar: false,
  branding: false,
  promotion: false,
  statusbar: false,
  plugins: 'lists link',
  toolbar: 'undo redo | bold italic underline | bullist numlist outdent indent | link removeformat',
  link_default_target: '_blank',
  link_title: false,
}
</script>

<template>
  <Editor v-model="model" licenseKey="gpl" :init="{ ...init, height }" />
</template>

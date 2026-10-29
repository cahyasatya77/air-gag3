# Pencatatan Air – Griya Asri Gadingan 3

Backend: Node.js + Fastify + MySQL/MariaDB (`src/`). Frontend: Vue 3 + Vite + Tailwind 4 + Pinia (`frontend/`), strukturnya mengikuti template di `docs/frontend.zip`.

## Menjalankan
1. `npm install`
2. Salin `.env.example` ke `.env`, isi `DATABASE_URL` dan `JWT_SECRET`.
3. `npm run seed` – membuat tabel, tarif, akun `admin` (password dicetak sekali), dan impor rumah + meter awal dari `docs/Pencatatan Meteran Air GAG3.xlsx` (sheet "Oktober 2026").
   Lalu `node src/db/scope-alamanda.js` membatasi pengelolaan ke A32–A87 (rumah lain nonaktif; A55, A56, A67 flat).
4. `npm start` → http://localhost:3000
5. `npm test` (memakai database `pencatatan_air_test`).

## Alur
- Periode = bulan pemakaian. Meter akhir diisi saat pencatatan tanggal 5 bulan berikutnya; meter awal periode berikutnya otomatis = meter akhir.
- Rumus (tabel `tariffs`, berversi per periode): ≤ 15 m³ = 25.000, tiap kelebihan 1 m³ + 1.000. Rumah status "tidak pakai air" = flat 10.000.
- Justifikasi (meteran rusak/ganti/putus) menimpa m³ atau nominal, wajib alasan, dan tercatat di audit log.
- Pembayaran otomatis dibagi: 10.000 ke kas jimpitan, sisanya ke kas pengelolaan air. Pengeluaran dicatat terpisah per dana.
- Semua perubahan penting masuk `audit_logs`.
- PDF: laporan tagihan per periode (untuk dibagikan tgl 7) dan tagihan per rumah.

## Riwayat & tunggakan
- `node src/db/import-history.js` mengimpor meteran Jul 2025–Sep 2026 (A32–A87) sebagai tagihan lama berstatus lunas, tanpa efek ke kas. Excel tidak mencatat pembayaran.
- Tunggakan nyata diinput administrator lewat menu **Tagihan Belum Lunas → + Tunggakan lama** (nominal, atau meter awal+akhir; keterangan wajib; masuk audit log).

## Kirim tagihan lewat WhatsApp
- Isi **No. WhatsApp** per rumah di menu Data Rumah (08xx / +62xx otomatis dinormalkan).
- Di halaman Pencatatan, tombol **WA** pada baris rumah membuka WhatsApp (wa.me) dengan pesan tagihan dan link PDF yang sudah terisi; pengurus tinggal menekan kirim.
- Link PDF bertanda tangan, berlaku 14 hari, dibuka tanpa login. Set `PUBLIC_URL` di `.env` ke alamat yang bisa diakses warga, jika tidak link memakai alamat server saat ini (mis. localhost).

## Frontend (maintenance)
```
frontend/src/
  assets/styles.css      tema warna (--color-brand-*) + kelas .btn .input .badge .card .th .td
  components/            komponen bersama: Alert, FormLabel, AppModal, PageHeader, StatCard, PeriodPicker, BillStatusBadge, EmptyState
  composables/           useNotify (pesan sukses/error), usePeriod (periode terpilih)
  layouts/MainLayout.vue header + sidebar (menu per peran didefinisikan di sini)
  router/index.js        daftar halaman + hak akses per peran (meta.roles)
  services/              pemanggilan API per domain (billing, master, cash); api.js = axios
  stores/auth.js         sesi & peran (Pinia)
  utils/formatters.js    format rupiah, periode, tanggal
  views/<Fitur>/Index.vue  satu folder per halaman (Readings, Cash, Houses, Users, Tariffs, ...)
```
- Menambah halaman: buat `views/Fitur/Index.vue`, tambah satu route di `router/index.js`, satu item menu di `MainLayout.vue`, dan fungsi API di `services/`.
- Mengubah warna: edit `--color-brand-*` di `assets/styles.css`.
- Pengembangan: `cd frontend && npm install && npm run dev` (http://localhost:5173, /api diteruskan ke backend :3000). Produksi: `npm run build`, hasilnya `frontend/dist` disajikan oleh backend.
- Pemeriksaan: `npm run lint`, `npm run format`.

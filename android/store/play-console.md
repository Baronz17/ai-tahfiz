# Panduan Play Console — AI Tahfiz (`id.aitahfiz.app`)

Urutan yang disarankan. Bagian bertanda ⚠️ adalah keputusan yang perlu diperiksa ulang di Play Console,
karena kebijakan Google bisa berubah.

## 0. Prasyarat
- [ ] Situs aktif di `https://tahfiz.lifeos.web.id` dengan HTTPS.
- [ ] Kunci upload dibuat dan 4 secrets diisi di GitHub (lihat README → *Aplikasi Android*).
- [ ] Build rilis berhasil → unduh `app-release.aab` dari artifact GitHub Actions.
- [ ] `.well-known/assetlinks.json` terpasang (agar address bar Chrome hilang).

## 1. Akun pengembang
- Daftar di https://play.google.com/console (biaya pendaftaran sekali bayar; cek nominal terbaru di halaman pendaftaran).
- Verifikasi identitas sesuai permintaan Google.
- **Akun pribadi baru wajib uji tertutup: minimal 12 penguji, ikut terus-menerus selama 14 hari**, sebelum boleh
  mengajukan akses produksi. Siapkan daftar email Gmail penguji (teman, santri, keluarga) dari sekarang.

## 2. Buat aplikasi
| Isian | Nilai |
|---|---|
| Nama aplikasi | AI Tahfiz |
| Bahasa default | Indonesia – id-ID |
| Aplikasi atau game | Aplikasi |
| Gratis atau berbayar | Gratis |

## 3. Listing toko (Main store listing)
**Nama (≤ 30 karakter):** `AI Tahfiz`

**Deskripsi singkat (≤ 80 karakter):**
```
Hafalan Al-Qur'an: mushaf, setoran suara, dan murajaah terjadwal.
```

**Deskripsi lengkap:**
```
AI Tahfiz membantu Anda menghafal Al-Qur'an dengan siklus yang teratur: dengar & baca, hafalkan, setorkan, lalu murajaah.

FITUR UTAMA
• Tampilan mushaf per halaman dengan info halaman, juz, dan hizb.
• Mode hafalan: sembunyikan ayat, lalu bacakan dari hafalan — kata yang Anda baca muncul otomatis saat mikrofon aktif.
• Daftar kesalahan: kata yang terlewat atau berbeda ditandai, dan bisa langsung dimasukkan ke jadwal murajaah.
• Murajaah terjadwal (pengulangan berjarak): ayat yang hafal diulang pada waktu yang tepat agar tidak lupa.
• Putar murattal berulang per ayat atau per rentang ayat (talaqqi).
• Penanda ayat dan "terakhir dibaca", pencarian surah, ayat (mis. 2:255), teks Arab, dan terjemahan.
• Statistik: target harian, hari beruntun, peta aktivitas, progres per surah.
• Bisa dipakai offline untuk surah yang sudah diunduh. Tema terang & gelap.

PRIVASI
Tanpa akun, tanpa iklan, tanpa pelacak. Progres hafalan tersimpan di perangkat Anda sendiri dan bisa diekspor.

PENTING
Pencocokan suara memakai pengenal suara bawaan browser dan hanya membandingkan kata dengan teks ayat — bukan penilaian tajwid atau makhraj, dan bisa keliru. Setoran kepada guru tetap menjadi rujukan. Teks Al-Qur'an bersumber dari AlQuran Cloud (edisi Utsmani); cocokkan dengan mushaf standar Anda.

Masukan & laporan: agilbaron59@gmail.com
```

**Aset grafis** (sudah tersedia di folder ini):
- Ikon aplikasi 512×512: `icon-512.png`
- Gambar fitur 1024×500: `feature-graphic-1024x500.png`
- **Screenshot ponsel (minimal 2)**: ambil sendiri dari aplikasi asli di HP (mushaf, mode sembunyi + mikrofon,
  lembar Kesalahan, Murajaah, Progres). Sengaja tidak dibuat otomatis agar teks Al-Qur'an yang tampil adalah teks
  asli dari aplikasi, bukan data uji.

**Kategori:** Pendidikan · **Email kontak:** agilbaron59@gmail.com · **Situs:** https://tahfiz.lifeos.web.id

## 4. Konten aplikasi (App content)
| Bagian | Jawaban yang sesuai kondisi aplikasi saat ini |
|---|---|
| Kebijakan privasi | `https://tahfiz.lifeos.web.id/privasi/` |
| Iklan | Tidak ada iklan |
| Akses aplikasi | Semua fitur tersedia tanpa login |
| Rating konten | Isi kuesioner dengan jujur: tidak ada kekerasan, konten seksual, perjudian, atau interaksi antarpengguna |
| Aplikasi berita / pemerintah / keuangan / kesehatan | Bukan |
| Target audiens | ⚠️ Lihat catatan di bawah |
| Keamanan data (Data safety) | ⚠️ Lihat catatan di bawah |

**Target audiens ⚠️** — Memilih kelompok usia di bawah 13 tahun membuat aplikasi tunduk pada *Families Policy*
(syarat tambahan untuk data, SDK, dan iklan). Untuk rilis pertama, pilihan paling sederhana adalah **13 tahun ke atas**;
aplikasi tetap bisa dipakai anak dengan pendampingan. Bila ingin menyasar anak secara resmi, tinjau dulu persyaratan
Families Policy terbaru.

**Keamanan data ⚠️** — Aplikasi ini (APK) sendiri tidak mengirim data apa pun; isinya adalah situs web yang dibuka
Chrome. Satu-satunya data yang keluar dari perangkat atas tindakan pengguna adalah **suara saat mikrofon aktif**, yang
diproses layanan pengenal suara Chrome (Google). Pilihan yang paling aman dari sisi kepatuhan adalah mengungkapkannya:
- Data dikumpulkan: **Ya** → *Audio → Rekaman suara atau audio*
- Dibagikan ke pihak ketiga: **Tidak** (diproses oleh penyedia layanan untuk fungsi aplikasi)
- Diproses secara sementara (*ephemeral*): **Ya** · Wajib atau opsional: **Opsional** (hanya saat mikrofon dipakai)
- Tujuan: **Fungsi aplikasi**
- Data dienkripsi saat dikirim: **Ya** · Pengguna dapat meminta penghapusan: tidak ada data yang disimpan pengembang
- Data lain (lokasi, kontak, identitas, analitik, dll.): **Tidak dikumpulkan**

Mengungkapkan lebih dari yang perlu lebih aman daripada kurang; Google dapat menindak deklarasi yang kurang lengkap.

## 5. Uji tertutup (wajib untuk akun pribadi baru)
1. *Testing → Closed testing → Create track* → unggah `app-release.aab`.
2. Tambahkan daftar email penguji (≥ 12), simpan, lalu bagikan tautan opt-in ke mereka.
3. Penguji memasang dari Play Store dan **tetap terdaftar 14 hari berturut-turut**.
4. Setelah 14 hari: *Dashboard → Apply for production* dan jawab pertanyaan tentang pengujian.

## 6. Setelah unggahan pertama: sidik jari kunci Play
Play Console menandatangani ulang aplikasi dengan **app signing key** milik Google (*Test and release → Setup →
App signing*). Salin **SHA-256** dari bagian *App signing key certificate* dan tambahkan ke
`.well-known/assetlinks.json` (di samping sidik jari kunci upload). Tanpa ini, aplikasi yang dipasang dari Play Store
akan menampilkan address bar Chrome.

## 7. Pembaruan
- Perubahan fitur/tampilan → cukup merge ke `main`; pengguna mendapatkannya otomatis.
- Unggah AAB baru hanya bila mengubah nama/ikon/warna aplikasi atau menaikkan `targetSdk` (syarat tahunan Google Play).
  `versionCode` otomatis naik mengikuti nomor run GitHub Actions.

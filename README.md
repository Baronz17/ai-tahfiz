# AI Tahfiz

PWA (tanpa build tool, tanpa dependensi) untuk menghafal Al-Qur'an dengan siklus:
**dengar & baca → hafalkan → setor suara → murajaah terjadwal**.

## Fitur
- **Tampilan mushaf** (default) — teks mengalir per halaman dengan penanda ayat, banner surah, info Halaman | Juz | Hizb.
  Bilah bawah: *Kesalahan*, ganti tampilan (mushaf/daftar), *sembunyikan ayat*, buka satu kata (‹) / sisa ayat («).
  **Ikuti bacaan:** tekan mikrofon dan baca dari hafalan — kata yang terdengar cocok muncul otomatis, kata terlewat
  ditandai merah, lalu ringkasan kesalahan bisa langsung dijadikan jadwal murajaah. Ketuk nomor ayat untuk menu
  (mulai hafalan dari ayat ini, putar, setor, tandai).
- **Akurasi pencocokan suara** — memilih tebakan transkripsi terbaik dari beberapa alternatif, toleran huruf yang
  bunyinya mirip (س/ص/ث, ذ/ز/ظ, ت/ط, ك/ق, ه/ح, ء/ع/ا) dan kata yang digabung/dipecah pengenal suara; kata terlewat
  ditandai *ragu* dulu dan bisa "diselamatkan" bila dibaca ulang. Kepekaan *Ketat/Normal/Longgar* di Pengaturan.
  Bilah **Terdengar** menampilkan teks mentah dari browser, dan daftar Kesalahan menunjukkan apa yang terdengar di
  posisi kata yang salah — untuk membedakan "browser salah dengar" dari "aplikasi salah cocok".
- **Penanda** — tandai ayat dari menu nomor ayat, tombol 🔖 di bilah info mushaf, atau tombol di daftar ayat;
  pita kecil tampil di nomor ayat. "Terakhir dibaca" tersimpan otomatis. Daftar penanda ada di Beranda dan tombol 🔖
  di atas. Ikut diekspor/impor.
- **Pencarian** (ikon 🔍 di atas, atau tekan `/`) — referensi (`2:255`, `yasin 71`), nama surah dengan ejaan Indonesia
  maupun Inggris (Yasin/Yaa-Seen, Thaha/Taa-Haa, At-Taubah/At-Tawba), teks Arab tanpa harakat, dan kata dalam
  terjemahan. Pencarian teks berjalan offline atas surah yang tersimpan (unduh semua surah di halaman Progres).
- **Huruf Latin** Plus Jakarta Sans (default), Nunito, atau Lora — pilih di Pengaturan.
- **Daftar ayat** — teks Utsmani + terjemahan Indonesia (AlQuran Cloud API), basmalah dipisah dari ayat 1.
  Mode tampilan: *Tampil*, *Huruf awal* (petunjuk), *Sembunyi* (ketuk untuk membuka).
- **Putar berulang (talaqqi)** — rentang ayat, ulang tiap ayat N×, opsi ulangi rentang, pilihan qari, ayat yang diputar disorot.
- **Setoran suara** (popup, bisa dibuka dari mana saja) — Web Speech API (`ar-SA`), hasil dibandingkan per kata
  dengan teks ayat (toleran terhadap perbedaan rasm Utsmani vs imla'i), kata yang terlewat ditandai, nilai disarankan.
- **Murajaah terjadwal** — pengulangan berjarak (varian SM-2) per ayat: *Lupa / Ragu / Lancar*, kartu dengan petunjuk
  ayat sebelumnya, ayat yang lupa diulang lagi di akhir sesi.
- **Progres** — target harian, hari beruntun, peta aktivitas 15 minggu, progres per surah.
- **Offline** — surah disimpan di IndexedDB; tombol "Unduh semua surah"; service worker untuk shell aplikasi.
- **Data** — ekspor/impor JSON (juga menerima ekspor versi MVP), migrasi otomatis progres MVP (`aitahfiz-progress-v1`).
- Tema terang/gelap, ukuran huruf Arab dapat diatur.

**Alamat aplikasi:** https://tahfiz.lifeos.web.id (GitHub Pages dengan domain sendiri; file `CNAME`).
**Kebijakan privasi:** https://tahfiz.lifeos.web.id/privasi/ (`privasi/index.html`) — perbarui bila aplikasi mulai
mengirim data ke layanan baru.

## Menjalankan
Service worker butuh `localhost` atau HTTPS (jangan buka lewat `file://`).

```bash
python3 -m http.server 8080
```

Buka `http://localhost:8080`. Untuk HP/instal PWA, host di layanan HTTPS statis (GitHub Pages, Netlify, dsb.).

## Tes
```bash
npm test
```
Menjalankan unit test (Node ≥ 20, tanpa dependensi) untuk normalisasi & pencocokan Arab, penjadwalan murajaah,
streak, migrasi, dan impor.

## Struktur
| Berkas | Isi |
|---|---|
| `js/arabic.js` | normalisasi, pencocokan bacaan, pemisahan basmalah, petunjuk huruf awal |
| `js/srs.js`, `js/progress.js` | penjadwalan murajaah dan model progres (murni, teruji) |
| `js/search.js` | inti pencarian: referensi, nama surah (ejaan longgar), teks Arab/terjemahan (murni, teruji) |
| `js/finder.js` | lembar pencarian & penanda, navigasi ke ayat |
| `js/follow.js` | mesin "ikuti bacaan": posisi pembaca, kata terlewat, lompatan (murni, teruji) |
| `js/mushaf.js` | tampilan mushaf, sembunyikan ayat, mikrofon, ringkasan kesalahan |
| `js/api.js`, `js/db.js` | klien API + cache IndexedDB |
| `js/state.js` | pengaturan & progres di localStorage, event perubahan |
| `js/reader.js`, `js/review.js`, `js/setoran.js`, `js/player.js` | tampilan Belajar, Murajaah, popup Setoran, pemutar audio |
| `js/app.js` | router, Beranda, Progres, Pengaturan |
| `sw.js` | service worker (naikkan `VERSION` setiap rilis) |

## Batasan penting
- Cocokkan teks dengan mushaf standar yang Anda gunakan. Untuk pemakaian serius, verifikasi sumber dan pin versi dataset.
- Pencocokan suara **bukan** penilai tajwid, makhraj, atau harakat — hanya membandingkan kata hasil transkripsi browser,
  yang bisa keliru untuk bacaan Al-Qur'an. Setoran kepada guru tetap rujukan.
- Tampilan mushaf memakai nomor halaman/juz/hizb dari data API, tetapi pemenggalan baris tidak sama persis dengan
  mushaf cetak 15 baris (butuh font per halaman seperti QCF).
- "Ikuti bacaan" bergantung pada transkripsi browser: kata bisa salah ditandai merah, terutama huruf yang mirip
  bunyinya atau bacaan cepat. Gunakan sebagai alat bantu, bukan penilai.
- Audio dan pengenalan suara memerlukan internet; audio tidak di-cache.
- Progres hanya di perangkat ini (localStorage). Ekspor berkala.
- 6.236 dipakai sebagai angka acuan jumlah ayat; sistem penomoran dapat berbeda.

## Aplikasi Android (Play Store)
Folder `android/` berisi aplikasi **Trusted Web Activity (TWA)**: APK tipis yang membuka
`https://tahfiz.lifeos.web.id` di Chrome secara layar penuh. Isi aplikasi tetap situs web ini, jadi setiap
perubahan yang di-merge ke `main` langsung sampai ke pengguna **tanpa** unggah ulang ke Play Store.
APK hanya perlu dibangun ulang untuk mengganti nama/ikon/warna atau menaikkan `targetSdk` (syarat tahunan Play).

**Build otomatis:** workflow `.github/workflows/android.yml` membangun APK uji coba setiap ada perubahan di
`android/`. Hasilnya diunduh dari tab *Actions* → run terbaru → *Artifacts*.

**Build rilis (AAB untuk Play Store)** membutuhkan kunci upload milik Anda sebagai *secrets* repo
(Settings → Secrets and variables → Actions):

| Secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | isi file keystore (`.jks`) dalam base64 |
| `ANDROID_KEYSTORE_PASSWORD` | kata sandi keystore |
| `ANDROID_KEY_ALIAS` | alias kunci |
| `ANDROID_KEY_PASSWORD` | kata sandi kunci |

Simpan file keystore dan kata sandinya di tempat aman di luar repo; tanpa itu aplikasi tidak bisa diperbarui.
Setelah build rilis pertama, sidik jari SHA-256 kunci tampil di ringkasan run; sidik jari itu (dan sidik jari
*app signing key* dari Play Console) dimasukkan ke `.well-known/assetlinks.json` agar aplikasi tampil tanpa address bar.

Membuka di Android Studio: *File → Open* → pilih folder `android/`.

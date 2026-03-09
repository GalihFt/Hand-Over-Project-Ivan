# Prompt Implementasi Lookup Koordinat (Database + Fallback Geocoding)

Lanjutkan implementasi fitur lookup koordinat dengan prioritas database wilayah, lalu fallback geocoding.

## Konteks
- Project: frontend + backend mapping
- Validasi alamat sekarang sering gagal.
- Saya ingin sumber utama koordinat dari database wilayah internal.
- Data master wilayah punya kolom: kecamatan, kabupaten, provinsi, latitude, longitude.
- Frontend sudah punya kolom LONGITUDE dan LATITUDE yang bisa diedit user.

## Target
1. Backend resolve koordinat dengan prioritas:
   - pakai LONGITUDE/LATITUDE dari input jika valid
   - jika kosong, lookup DB wilayah (exact + fuzzy)
   - jika tidak ketemu, fallback ke geocoding eksternal
2. Matching berjenjang MAKSIMAL sampai kabupaten:
   - kecamatan + kabupaten + provinsi
   - kabupaten + provinsi
   - jika masih gagal, langsung geocoding eksternal (jangan match level provinsi saja)
3. Tambahkan fuzzy matching pakai rapidfuzz dengan threshold aman, dan status:
   - match_level: kecamatan|kabupaten|geocoded|not_found|ambiguous
   - match_score
   - matched_region
4. Optimasi performa:
   - normalisasi data master sekali di awal
   - prefilter kandidat by provinsi/kabupaten sebelum fuzzy
   - cache hasil alamat yang sama
5. Integrasikan ke endpoint validasi dan optimize agar pakai koordinat hasil lookup/fallback.
6. Jangan ubah fitur yang sudah jalan selain bagian terkait lookup koordinat.
7. Tambahkan logging ringkas: total row, matched kecamatan, matched kabupaten, geocoded, ambiguous, not_found.
8. Tambahkan fallback aman jika data master belum tersedia (tetap bisa jalan via geocoding, dengan warning jelas).
9. Berikan patch code + daftar file yang diubah + cara test lokal step-by-step.

## Kriteria Selesai
- Kasus optimize gagal karena alamat tidak ketemu berkurang.
- Row yang gagal punya alasan jelas.
- Proses tetap cepat untuk ribuan data master wilayah.

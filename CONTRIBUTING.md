# Panduan Kontribusi (Contributing Guide)

Terima kasih atas ketertarikan Anda untuk berkontribusi pada **Zero-Knowledge Multi-Image Keyfile 2FA**! Proyek ini bersifat sumber terbuka (*open-source*) dan menyambut berbagai bentuk kontribusi, mulai dari perbaikan bug, penambahan fitur kriptografi, pengoptimalan performa, hingga dokumentasi.

---

## 🛠️ Persyaratan Lingkungan Pengembangan

1. **Node.js**: Versi 18 LTS atau lebih tinggi.
2. **NPM**: Versi 9 atau lebih tinggi.
3. *(Opsional)* **Circom 2.0 & SnarkJS**: Jika Anda ingin mengompilasi ulang atau memodifikasi sirkuit ZKP (`.circom`).

---

## 🚀 Alur Kerja Berkontribusi (Workflow)

1. **Fork Repositori**  
   Klik tombol **Fork** di pojok kanan atas repositori GitHub ini.

2. **Kloning ke Komputer Lokal**
   ```bash
   git clone https://github.com/<username-anda>/zk-multi-image-keyfile-2fa.git
   cd zk-multi-image-keyfile-2fa
   ```

3. **Pasang Dependensi**
   ```bash
   npm install
   ```

4. **Buat Branch Fitur Baru**
   Gunakan nama cabang yang deskriptif:
   ```bash
   git checkout -b feat/nama-fitur
   # atau
   git checkout -b fix/deskripsi-bug
   ```

5. **Jalankan Pengujian Otomatis**
   Pastikan seluruh rangkaian 14 automated tests berjalan sukses:
   ```bash
   npm test
   ```

6. **Lakukan Perubahan Kode**
   - Jaga gaya kode tetap konsisten, rapi, dan mudah dibaca.
   - Tambahkan komentar penjelas dalam bahasa Indonesia atau Inggris untuk algoritma matematika/kriptografi yang kompleks.
   - Jika mengubah antarmuka pengguna (`client/`), jaga tema monokrom minimalis (Hitam • Putih • Abu-Abu).

7. **Komit Perubahan Anda**
   Gunakan konvensi [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: tambahkan dukungan Web Worker untuk Groth16 prover"
   ```

8. **Push ke GitHub & Buat Pull Request**
   ```bash
   git push origin feat/nama-fitur
   ```
   Buka halaman repositori asal di GitHub, lalu klik tombol **Compare & pull request**.

---

## 💡 Ide & Area Kontribusi yang Terbuka

Berikut beberapa area yang sangat terbuka untuk eksplorasi dan pengembangan lebih lanjut:

### 1. Sirkuit ZKP & Kriptografi (`circuits/`)
- Mengurangi jumlah constraint R1CS pada template Poseidon.
- Menambahkan fleksibilitas jumlah berkas kunci ($N$ gambar dinamis).
- Eksplorasi skema pembuktian alternatif tanpa trusted setup spesifik sirkuit (misalnya PLONK atau Halo2).
- **Multi-Party Computation (MPC) Ceremony**: Kontribusi entropi acak independen untuk upacara setup Fase 2 sirkuit agar bebas dari risiko *toxic waste*.

### 2. Klien & Performa Browser (`client/`)
- **Web Worker**: Memindahkan sintesis bukti `snarkjs.groth16.fullProve` ke Web Worker di latar belakang agar antarmuka tidak mengalami *freeze* saat komputasi berat.
- **PWA & Aksesibilitas**: Menjadikan aplikasi dapat diinstal sebagai Progressive Web App (PWA) offline.

### 3. Server & Ketahanan Serangan (`server/`)
- Integrasi penyimpanan persisten (PostgreSQL / SQLite / Redis) untuk menggantikan mock in-memory.
- Rate limiting berbasis IP/User untuk mencegah *Denial-of-Service* (DoS) pada verifikasi pairing.
- Integrasi WebAuthn / FIDO2 sebagai faktor pelengkap.

### 4. Pengujian & Keamanan (`tests/`)
- Menambahkan skenario uji mutasi proof dan resistansi terhadap serangan *malleability*.
- Benchmark performa pada perangkat berspesifikasi rendah (mobile/IoT).

---

## 📜 Lisensi
Dengan berkontribusi pada proyek ini, Anda menyetujui bahwa kontribusi Anda akan dilisensikan di bawah lisensi [MIT License](LICENSE).

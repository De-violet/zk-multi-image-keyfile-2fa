# 🔐 Zero-Knowledge Multi-Image Keyfile 2FA

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)
[![Tests](https://img.shields.io/badge/Tests-14%2F14%20Passing-success?style=for-the-badge)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)](LICENSE)

**🌐 Coba Demo Langsung (Gratis di GitHub Pages):**  
👉 **[https://de-violet.github.io/zk-multi-image-keyfile-2fa/](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)**

---

Sistem Otentikasi dan Pemulihan Akun berbasis **Zero-Knowledge Proofs (Groth16 zk-SNARKs & Circom 2.0)** menggunakan 3 berkas gambar pribadi sebagai kunci kriptografis (*Keyfile 2FA*).

Foto Anda **100% tidak pernah diunggah atau disimpan di server**. Browser WebAssembly menghitung bukti matematika secara lokal, sehingga server hanya memvalidasi keaslian bukti tanpa pernah mengetahui isi fotonya.

---

## 🚀 Alur Kerja Sistem

Aplikasi ini dibagi menjadi 3 langkah berurutan:

1. **1. Daftar Akun**  
   Pengguna mendaftarkan username, password, dan memilih 3 foto pribadi dari perangkat. Browser menghitung *Root Commitment* secara lokal dan menyimpannya di server sebagai pengaman akun.
2. **2. Login Akun & Pemulihan (Lupa Password)**  
   - **Login Harian**: Cukup masukkan username dan password akun Anda.
   - **Skenario Lupa Password**: Pengguna dapat mereset password baru dengan membuktikan kepemilikan 3 foto kunci menggunakan ZK-Proof tanpa mengirim foto ke server.
3. **3. Verifier (ZKP Lab)**  
   Laboratorium interaktif untuk menguji 3 pilar kriptografi ZKP:
   - **Witness**: Perhitungan saksi lokal dari 3 berkas foto.
   - **Proof**: Sintesis bukti Groth16 256-byte ($\pi_A, \pi_B, \pi_C$).
   - **Verifier**: Validasi persamaan *bilinear pairing* (dilengkapi tombol *Tamper Test* untuk membuktikan penolakan bukti palsu).

---

## 🛠️ Panduan Lengkap Eksekusi & Menjalankan Proyek

### 1. Prasyarat Sistem
Pastikan perangkat Anda telah terpasang:
- **Node.js**: Versi `>= 18.0.0` (disarankan v20 LTS)
- **NPM**: Versi `>= 9.0.0`
- **Git**
- *(Opsional)* **Circom 2.0 & SnarkJS**: Hanya jika Anda ingin mengompilasi ulang sirkuit `.circom`. Seluruh artefak hasil kompilasi (`.wasm`, `.zkey`, `verification_key.json`) sudah disertakan di repositori dan siap digunakan langsung.

---

### 2. Kloning & Instalasi Dependensi

```bash
# Kloning repositori
git clone https://github.com/De-violet/zk-multi-image-keyfile-2fa.git

# Masuk ke direktori proyek
cd zk-multi-image-keyfile-2fa

# Pasang seluruh dependensi (circomlib, snarkjs, express, cors)
npm install
```

---

### 3. Menjalankan Pengujian Otomatis (Test Suite)

Repositori ini dilengkapi rangkaian pengujian otomatis (*automated testing*) menggunakan Node.js Native Test Runner (`node:test`):

```bash
# Menjalankan seluruh 14 pengujian sekaligus
npm test
```

Anda juga dapat menjalankan pengujian secara modular:

```bash
# 1. Uji Sirkuit ZKP & Pembuktian Groth16 (Valid proof, zero-noise tolerance, tamper detection)
npm run test:circuit

# 2. Uji Kriptografi Hash (Determinisme SHA-256 reduksi medan BN254, salt entropy, hierarki Poseidon)
npm run test:hash

# 3. Uji End-to-End Otentikasi & Serangan (Register, challenge, verify, replay attack, expired nonce)
npm run test:e2e
```

**Hasil Pengujian:**
```text
✔ Circom Circuit & Groth16 Proof Synthesis and Verification (1412 constraints)
✔ End-to-End Authentication & Attack Resistance Lifecycle
✔ SHA-256 to BN254 Field Reduction Determinism
✔ Poseidon Hierarchical Commitment & Session Token
ℹ tests 14 | pass 14 | fail 0
```

---

### 4. Menjalankan Server & Antarmuka Web Lokal

Jalankan server otentikasi Express dan penyaji statis frontend:

```bash
npm start
```
*Atau mode pengembangan:*
```bash
npm run dev
```

Buka peramban web di alamat:
👉 **`http://localhost:3000`**

---

### 5. (Opsional) Kompilasi Ulang Sirkuit Circom ZKP

Jika Anda mengubah berkas sirkuit di [`circuits/MultiImageKeyfile2FA.circom`](circuits/MultiImageKeyfile2FA.circom), kompilasi ulang sirkuit ke R1CS, WASM, dan jalankan Groth16 Trusted Setup dengan perintah:

```bash
npm run compile:circuit
```
*Perintah ini menjalankan skrip `circuits/scripts/compile.sh` yang otomatis:*
1. Mengompilasi sirkuit Circom ke constraint R1CS dan modul C++/WASM.
2. Menghasilkan kontribusi Powers of Tau (Kurva BN128/BN254).
3. Melakukan Groth16 phase 2 contribution untuk menghasilkan proving key `circuit_final.zkey`.
4. Mengekspor `verification_key.json` dan smart contract Solidity `contracts/MultiImageVerifier.sol`.
5. Menyinkronkan artefak build ke direktori `client/public/zk/`.

---

## 📖 Panduan Praktik Uji Coba (Demo Walkthrough)

Setelah membuka aplikasi web di browser:

### Skenario A: Pendaftaran Akun (Tab 1. Daftar Akun)
1. Masukkan **Username** dan **Password**.
2. Pilih **3 file foto acak** apa saja dari perangkat Anda pada slot 1, 2, dan 3.
3. Klik tombol **1. Daftarkan Akun & Kunci 2FA**.
4. Browser akan membaca byte foto secara lokal, menghitung reduksi SHA-256 modulo BN254, dan menghasilkan *Root Commitment* Poseidon. Foto **tidak pernah dikirim** ke server.

### Skenario B: Login Biasa & Uji Pemulihan Lupa Password (Tab 2. Login Akun)
1. **Login Harian**: Masukkan Username dan Password yang telah Anda daftarkan, lalu klik **2. Masuk ke Akun**. Login berhasil secara instan tanpa perlu memasukkan foto.
2. **Uji Skenario Lupa Password**:
   - Klik tautan **"Lupa Password? Pulihkan →"**.
   - Masukkan username akun Anda dan ketik **Password Baru**.
   - Masukkan kembali **3 foto kunci yang sama** yang digunakan saat pendaftaran.
   - Klik **Buktikan via ZKP & Reset Password**.
   - Browser WebAssembly akan membuat bukti matematika Groth16 (~700ms), mengirimkan bukti ke server untuk verifikasi persamaan pairing, dan mereset password akun Anda secara aman.

### Skenario C: Eksperimen Verifier Kriptografi (Tab 3. Verifier)
1. Pilih 3 file foto pada panel pemilih foto.
2. Klik **Hitung Witness dari Foto** (Tahap A) &rarr; Perhatikan pembacaan byte foto ke medan skalar BN254.
3. Klik **Sintesis Proof** (Tahap B) &rarr; Browser merakit bukti Groth16 ringkas ($\pi_A, \pi_B, \pi_C$).
4. Klik **Jalankan Verifier** (Tahap C) &rarr; Verifier memvalidasi persamaan *bilinear pairing* dalam hitungan milidetik.
5. **Uji Ketahanan Data (Tamper Proof)**:
   - Klik tombol **"🧪 Rusak Bukti (Tamper Proof)"** di Tahap B (satu nilai koordinat eliptik diubah secara sengaja).
   - Klik kembali **"Jalankan Verifier"**.
   - Sistem akan langsung menampilkan status **✕ VERIFICATION FAILED (Bukti Ditolak)**, membuktikan integritas matematis bahwa manipulasi sekecil apapun akan digagalkan.

---

## 📂 Struktur Direktori Proyek

```text
├── circuits/                       # Sirkuit Circom ZKP
│   ├── MultiImageKeyfile2FA.circom # Sirkuit utama Poseidon 2FA (~1.412 constraints)
│   ├── build/                      # Artefak hasil kompilasi (WASM, zkey, vkey)
│   └── scripts/compile.sh          # Skrip otomatisasi kompilasi & trusted setup
├── client/                         # Frontend Web Monokrom
│   ├── index.html                  # Halaman utama aplikasi (Tab 1, 2, 3)
│   ├── src/                        # Logika aplikasi dan adapter serverless
│   │   ├── main.js                 # Controller utama UI, state, dan dual adapter
│   │   ├── crypto/                 # SHA-256 reduction, Poseidon hash, Groth16 prover
│   │   └── styles/main.css         # Desain antarmuka monokrom minimalis
│   └── public/                     # Asset WebAssembly sirkuit dan pustaka vendor
├── contracts/                      # Smart Contract Solidity (MultiImageVerifier.sol)
├── server/                         # Backend Express.js
│   ├── src/app.js                  # Entry point HTTP server & health check
│   ├── src/authController.js       # Logika otentikasi, nonce anti-replay, & verifier
│   └── data/                       # Mock database lokal
├── tests/                          # Automated Test Suite (14 Tests)
│   ├── circuit.test.js             # Pengujian bukti sirkuit Groth16
│   ├── hash.test.js                # Pengujian reduksi deterministik & Poseidon
│   └── e2e.test.js                 # Pengujian siklus penuh otentikasi & keamanan
├── CONTRIBUTING.md                 # Panduan kontribusi open-source
└── README.md                       # Dokumentasi utama proyek
```

---

## 🌐 Teknologi Utama

- **Circom 2.0**: Perancangan sirkuit R1CS ZKP (~1.412 constraints)
- **SnarkJS**: Pustaka Groth16 Prover (WASM) & Verifier (Kurva BN254 / alt_bn128)
- **Poseidon Hash**: Algoritma hashing ramah-ZK hierarkis berkecepatan tinggi
- **Express.js**: Server API otentikasi dengan manajemen Anti-Replay Nonce (TTL 60 detik)
- **Vanilla JavaScript & CSS**: Frontend murni tanpa framework, ringan, cepat, dan mandiri

---

## 🤝 Kontribusi

Tertarik berkontribusi? Silakan baca panduan lengkap di **[CONTRIBUTING.md](CONTRIBUTING.md)** untuk alur kerja pengembangan, arsitektur, dan petunjuk pengiriman Pull Request.

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

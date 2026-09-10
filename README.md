# 🔐 Zero-Knowledge Multi-Image Keyfile 2FA

[![CI Test Suite](https://github.com/De-violet/zk-multi-image-keyfile-2fa/actions/workflows/ci.yml/badge.svg)](https://github.com/De-violet/zk-multi-image-keyfile-2fa/actions/workflows/ci.yml)
[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)
[![Tests](https://img.shields.io/badge/Tests-29%2F29%20Passing-success?style=for-the-badge)](tests/)
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
   Pengguna mendaftarkan username, password, dan memilih 3 foto pribadi dari perangkat. Sistem secara otomatis melakukan **penyortiran deterministik** (*Order-Independent Keyfile*) dan memvalidasi keunikan foto (*Anti-Trivial Collision*). Browser menghitung *Root Commitment* secara lokal dengan salt deterministik per-user (`deriveSaltFromUsername`) dan menyimpannya di server sebagai pengaman akun. Pengguna juga dapat mengunduh salinan cadangan komitmen kriptografis (`.key`). Sistem memproteksi pendaftaran ganda untuk mencegah *Account Takeover*.
2. **2. Login Akun & Pemulihan (Lupa Password)**  
   - **Login Cepat Standar**: Masuk langsung menggunakan username dan password master (Faktor 1 dengan PBKDF2 100.000 iterasi). Menerbitkan Bearer session token untuk mengakses protected endpoint (`/api/user/vault`).
   - **Login 2FA Penuh (3 Foto Kunci)**: Aktifkan switch toggle 2FA untuk membuktikan kepemilikan 3 foto kunci secara kriptografis menggunakan Groth16 ZK-Proof sebelum sesi akses diterbitkan. Urutan foto yang dipilih bebas karena otomatis dinormalisasi secara deterministik.
   - **Skenario Lupa Password (Self-Sovereign Recovery)**: Pengguna dapat mereset password baru dengan membuktikan kepemilikan 3 foto kunci menggunakan ZK-Proof tanpa mengirim foto ke server. Seluruh endpoint publik **bebas dari kebocoran Root Commitment maupun Salt**, menutup celah *offline dictionary attack*.
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

# Pasang seluruh dependensi (circomlib, snarkjs, express, cors, solc)
npm install
```

---

### 3. Menjalankan Pengujian Otomatis (Test Suite)

Repositori ini dilengkapi rangkaian pengujian otomatis (*automated testing*) menggunakan Node.js Native Test Runner (`node:test`):

```bash
# Menjalankan seluruh 29 pengujian sekaligus
npm test
```

Anda juga dapat menjalankan pengujian secara modular:

```bash
# 1. Uji Sirkuit ZKP & Pembuktian Groth16 (Valid proof, zero-noise tolerance, tamper detection)
npm run test:circuit

# 2. Uji Kriptografi Hash (Determinisme SHA-256 reduksi medan BN254, salt entropy, sorting deterministik, anti-duplikat)
npm run test:hash

# 3. Uji End-to-End Otentikasi & Keamanan (Register, challenge, verify, session auth, rate limiting terintegrasi)
npm run test:e2e

# 4. Uji Smart Contract Solidity (Kompilasi Groth16 Verifier & MultiImage2FAVault dengan nonce TTL via solc)
npm run test:solidity
```

**Hasil Pengujian:**
```text
✔ Circom Circuit & Groth16 Proof Synthesis and Verification (1412 constraints)
✔ End-to-End Authentication & Attack Resistance Lifecycle (Session Auth & Schema Validation)
✔ Proteksi Rate Limiting (Sliding Window & Anti-Bruteforce Terintegrasi)
✔ SHA-256 to BN254 Field Reduction Determinism & Order-Independent Sorting
✔ Poseidon Hierarchical Commitment & Session Token
✔ Solidity Smart Contract Tooling & Bytecode Verification (solc)
ℹ tests 29 | pass 29 | fail 0
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

## 🔒 Keamanan & Catatan Penting Trusted Setup (Toxic Waste Caveat)

Sistem ini menggunakan skema pembuktian **Groth16 zk-SNARKs**, yang memerlukan dua fase **Trusted Setup**: Fase 1 (Universal Powers of Tau) dan Fase 2 (Circuit-Specific Setup).

> [!WARNING]
> **Bahaya Entropi Statis / Hardcoded:**  
> Parameter rahasia sementara yang dihasilkan saat proses setup disebut sebagai ***toxic waste*** (trapdoor: $\alpha, \beta, \gamma, \delta, x$). Jika nilai entropi yang dimasukkan ke dalam setup di-hardcode dalam repositori publik, pihak luar dapat merekonstruksi trapdoor tersebut dan memalsukan bukti ZK valid untuk `rootCommitment` milik akun manapun tanpa pernah memiliki foto kuncinya.

### Arsitektur Keamanan & Mitigasi Serangan (Security Hardening):
1. **Peniadaan Hardcode Entropi**: Flag plaintext `-e="..."` telah dihapus dari `circuits/scripts/compile.sh`.
2. **Mode Interaktif Dinamis**: Saat dijalankan di terminal, `snarkjs` akan meminta input entropi keyboard acak rahasia langsung dari pengguna.
3. **Fallback CSPRNG Non-Interaktif**: Pada lingkungan non-interaktif (seperti CI/CD), skrip mengambil entropi acak kriptografis langsung dari `/dev/urandom` sistem operasi dan segera menghapus variabelnya dari memori.
4. **Dukungan PTAU Publik (Produksi)**: Skrip mendukung penggunaan file PTAU dari upacara publik universal (seperti upacara [Hermez Network / PSE Perpetual Powers of Tau](https://github.com/iden3/snarkjs#7-prepare-phase-2)) melalui parameter `PUBLIC_PTAU_PATH`:
   ```bash
   PUBLIC_PTAU_PATH=./powersOfTau28_hez_final_12.ptau npm run compile:circuit
   ```
   *Pada lingkungan produksi, gunakan file PTAU publik terverifikasi dan jalankan upacara MPC Fase 2 multi-partisipan untuk menjamin asumsi 1-of-N honest participant.*
5. **Pencegahan Offline Dictionary Attack (Total Zero Commitment Leakage)**:
   Endpoint publik `/api/auth/recover-challenge` dan `/api/auth/user/:username` **tidak pernah mengembalikan `rootCommitment` maupun `salt2fa`**. Salt diturunkan secara deterministik dari username (`deriveSaltFromUsername`) dan tertanam di dalam komitmen lokal. Penyerang publik sama sekali tidak memiliki akses terhadap target commitment untuk melancarkan serangan kamus offline terhadap foto korban.
6. **Mitigasi Account Takeover & Validasi Skema**:
   Endpoint registrasi menolak pendaftaran ganda (`409 Conflict`) jika username sudah terdaftar. Dilengkapi validasi skema input (panjang username 3-32 alfanumerik, password minimal 6 karakter, dan batasan rentang elemen medan kurva BN254).
7. **Perlindungan Brute-Force (Rate Limiting) & Reverse Proxy Trust**:
   Dilengkapi *Sliding Window Rate Limiter* (15 req/menit untuk auth, 5 req/menit untuk recovery) dengan konfigurasi `trust proxy` guna mencegah serangan *credential stuffing* di balik reverse proxy (Nginx/Cloudflare/Docker).
8. **Opsi Login 2FA Penuh (Dual-Factor Verification)**:
   Antarmuka web menyediakan toggle "Proteksi 2FA Penuh (3 Foto Kunci)" yang menjalankan verifikasi dua lapis secara nyata: validasi password (F1) via `/challenge` dan validasi ZK-Proof 3 foto (F2) via `/verify-2fa`.
9. **Penyortiran Deterministik (Order-Independent Keyfile) & Deteksi Duplikat**:
   Foto kunci yang diunggah otomatis diurutkan secara deterministik berdasarkan representasi BigInt skalar BN254, sehingga urutan pemilihan foto 1, 2, dan 3 bebas dan tidak menggagalkan verifikasi. Sistem secara proaktif menolak foto duplikat untuk mencegah reduksi entropi.
10. **Manajemen Sesi & Endpoint Terproteksi (Bearer Token Auth)**:
    Server mengelola sesi aktif dengan Bearer token (TTL 24 jam) dan menyediakan endpoint terproteksi (`/api/user/vault`) serta pembatalan sesi seketika saat logout (`/api/auth/logout`).
11. **Keamanan Nonce Smart Contract On-Chain (TTL 5 Menit)**:
    Kontrak `MultiImage2FAVault.sol` melacak timestamp penerbitan nonce dan membatasi masa berlakunya selama 5 menit (`NONCE_TTL`), mencegah eksploitasi *dangling challenge* di blockchain.

---

## 📖 Panduan Praktik Uji Coba (Demo Walkthrough)

Setelah membuka aplikasi web di browser:

### Skenario A: Pendaftaran Akun (Tab 1. Daftar Akun)
1. Masukkan **Username** dan **Password**.
2. Pilih **3 file foto acak** apa saja dari perangkat Anda pada slot 1, 2, dan 3 (urutan bebas, drag-and-drop didukung).
3. Klik tombol **1. Daftarkan Akun & Kunci 2FA**.
4. Browser akan membaca byte foto secara lokal, menghitung reduksi SHA-256 modulo BN254, mengurutkannya secara deterministik, dan menghasilkan *Root Commitment* Poseidon. Foto **tidak pernah dikirim** ke server.

### Skenario B: Login Biasa & Uji Pemulihan Lupa Password (Tab 2. Login Akun)
1. **Login Harian**: Masukkan Username dan Password yang telah Anda daftarkan, lalu klik **2. Masuk ke Akun**. Login berhasil secara instan tanpa perlu memasukkan foto.
2. **Uji Otorisasi Vault**: Di layar sukses, klik tombol **"🔓 Uji Otorisasi Vault"** untuk menguji request ke protected endpoint `/api/user/vault` menggunakan Bearer session token.
3. **Uji Skenario Lupa Password**:
   - Klik tautan **"Lupa Password? Pulihkan →"**.
   - Masukkan username akun Anda dan ketik **Password Baru**.
   - Masukkan kembali **3 foto kunci yang sama** yang digunakan saat pendaftaran (dalam urutan slot apa pun).
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
│   ├── index.html                  # Halaman utama aplikasi (Tab 1, 2, 3 & status koneksi)
│   ├── src/                        # Logika aplikasi dan adapter serverless
│   │   ├── main.js                 # Controller UI, drag-and-drop, state, dual adapter
│   │   ├── crypto/                 # SHA-256 reduction, deterministic sorting, Poseidon, Groth16
│   │   └── styles/main.css         # Desain antarmuka monokrom minimalis
│   └── public/                     # Asset WebAssembly sirkuit dan pustaka vendor
├── contracts/                      # Smart Contract Solidity
│   ├── MultiImage2FAVault.sol      # Vault on-chain dengan nonce TTL & anti-replay
│   └── MultiImageVerifier.sol      # Groth16 pairing verifier contract
├── server/                         # Backend Express.js
│   ├── src/app.js                  # Entry point HTTP server, trust proxy, health & routes
│   ├── src/authController.js       # Logika otentikasi, validasi skema, & verifier
│   ├── src/sessionManager.js       # Session token manager & in-memory store (TTL 24h)
│   ├── src/nonceManager.js         # Nonce generator & single-use anti-replay burner
│   ├── src/rateLimiter.js          # In-memory sliding window rate limiter
│   └── src/zkVerifier.js           # Groth16 verification via SnarkJS
├── tests/                          # Automated Test Suite (29 Tests)
│   ├── circuit.test.js             # Pengujian sirkuit Groth16 & zero-noise tolerance
│   ├── hash.test.js                # Pengujian reduksi, salt, order-independent sorting & duplikat
│   ├── e2e.test.js                 # Pengujian siklus otentikasi, session auth, rate limit & skema
│   └── solidity.test.js            # Pengujian kompilasi kontrak & validasi interface solc
├── .env.example                    # Template konfigurasi environment
├── Dockerfile                      # Container build spesifikasi Node 20 LTS Alpine
├── docker-compose.yml              # Konfigurasi orkestrasi container Docker
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

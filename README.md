# Zero-Knowledge Multi-Image Keyfile 2FA

Sistem Otentikasi dan Pemulihan Akun berbasis Zero-Knowledge Proofs (Groth16 zk-SNARKs dan Circom 2.0) menggunakan kombinasi berkas gambar pribadi (Keyfile 2FA) dan Visual TOTP dinamis.

Seluruh pemrosesan bukti kriptografi dieksekusi secara lokal di sisi klien menggunakan WebAssembly dan Web Worker. Kunci privat dan foto tidak pernah dikirim ke server. Server hanya menerima dan memverifikasi bukti matematika tanpa mengetahui data rahasia.

---

## Arsitektur Visual OTP

Visual TOTP adalah mekanisme otentikasi faktor kedua berbasis waktu yang merender pola visual deterministik 8x8 pada elemen HTML Canvas dan membuktikan validitasnya ke server melalui ZK-SNARKs.

```
+-------------------------------------------------------------------+
|                        CLIENT (Browser)                           |
|                                                                   |
|  [Master Secret] + [Time Window (t)]                              |
|           |                                                       |
|           v                                                       |
|  Poseidon Hash -> Seed Komitmen                                   |
|           |                                                       |
|           +---> Bit-packing (2x8-bit) -> 4-bit Nibble Mapping      |
|           |         |                                             |
|           |         v                                             |
|           |     [Canvas Renderer] (Grid 8x8, 16 Palet Warna)      |
|           |                                                       |
|           v                                                       |
|  [Web Worker: SnarkJS Groth16]                                    |
|      Input: masterSecret, timeWindow, serverNonce                 |
|      Aset:  VisualTOTP.wasm, VisualTOTP_final.zkey (via CORS)     |
|      Output: Proof + Public Signals                               |
+-------------------------------------------------------------------+
                                |
                   POST /api/auth/verify-2fa
                                |
+-------------------------------------------------------------------+
|                        SERVER (Node.js)                           |
|                                                                   |
|  1. Baca parameter: proof, publicSignals, nonce, timeWindow       |
|  2. Single-Use Nonce Burning (Anti-Replay Ledger)                |
|  3. Validasi Time Drift (+-1 siklus interval 60s)                 |
|  4. Verifikasi Pairing Kriptografi Groth16                        |
|  5. Baca kunci visual OTP (imageCommitment) & Terbitkan Sesi      |
+-------------------------------------------------------------------+
```

### 1. Representasi Visual dan Rendering Canvas
- Seed komitmen diturunkan dari hash Poseidon antara masterSecret dan timeWindow.
- Data biner dinormalisasi ke 32-byte (256-bit) dan diurai menjadi 16 pasangan kata 16-bit (2x8-bit).
- Setiap kata diekstraksi menjadi nilai 4-bit (rentang 0-15) yang memetakan warna pada 16 palet warna baku (`VISUAL_PALETTE_16`).
- CanvasRenderer menggambar 64 sel (grid 8x8) menggunakan `fillRect` secara efisien tanpa manipulasi DOM berlebih.

### 2. Komputasi Proof di Web Worker
- Sintesis bukti Groth16 dijalankan di background thread (`client/public/workers/zkWorker.js`) agar antarmuka pengguna tidak mengalami freeze.
- Web Worker memuat artefak `VisualTOTP.wasm` dan `VisualTOTP_final.zkey` melalui fetch HTTP.
- Server Express dikonfigurasi dengan header CORS (`Access-Control-Allow-Origin: *`) dan `Cross-Origin-Resource-Policy: cross-origin` sehingga berkas WASM dan ZKey dapat dimuat oleh Web Worker tanpa hambatan isolasi lintas-origin (Cross-Origin Isolation / COEP / CORP).

### 3. Logika Sirkuit Circom (VisualTOTP.circom)
- Input Privat: `masterSecret`
- Input Publik: `timeWindow` (indeks interval 60 detik), `serverNonce` (challenge acak sekali pakai)
- Output Publik:
  - `imageCommitment` = Poseidon(masterSecret, timeWindow) (kunci visual OTP aktif)
  - `sessionAuthToken` = Poseidon(imageCommitment, serverNonce)

### 4. Verifikasi Server, Toleransi Waktu, dan Pembakaran Nonce
- Permintaan tantangan: Klien memanggil `/api/auth/visual-challenge` untuk mendapatkan ephemeral `sessionNonce` dan `timeWindow` server.
- Pembakaran Nonce Sekali Pakai (Single-Use Nonce Burning): Saat verifikasi diterima di `/api/auth/verify-2fa` atau `/api/auth/verify-visual-totp`, server memeriksa status nonce di `nonceManager`. Nonce yang valid langsung dihapus dari daftar aktif dan dimasukkan ke dalam ledger nonce terbakar. Percobaan verifikasi kedua dengan nonce yang sama langsung ditolak (perlindungan terhadap replay attack).
- Toleransi Jendela Waktu (Time Window Drift Tolerance): Server membandingkan `clientTimeWindow` terhadap jendela waktu server saat ini. Selisih hingga +-1 siklus (drift +-60 detik) ditoleransi untuk mengantisipasi perbedaan jam perangkat klien, sedangkan selisih lebih dari 1 siklus langsung ditolak.
- Pembacaan Kunci Visual OTP: Endpoint membaca `publicSignals[0]` sebagai kunci komitmen visual OTP dan mengonfirmasi konsistensi parameter sebelum menerbitkan token sesi akses.

---

## Panduan Instalasi dan Menjalankan Proyek

### 1. Prasyarat Sistem
- Node.js versi >= 18.0.0 (direkomendasikan versi 20 LTS)
- NPM versi >= 9.0.0
- Git

### 2. Kloning Repositori
```bash
git clone https://github.com/De-violet/zk-multi-image-keyfile-2fa.git
cd "Zero-Knowledge Multi-Image Keyfile 2FA"
```

### 3. Instalasi Dependensi
Pasang paket dependensi yang dibutuhkan (circomlib, snarkjs, express, cors, hardhat):
```bash
npm install
```

### 4. Konfigurasi Lingkungan (.env)
Salin contoh konfigurasi ke berkas `.env`:
```bash
cp .env.example .env
```
Variabel default:
- `PORT=3000`
- `NODE_ENV=development`
- `DEMO_MODE=true`

### 5. Menjalankan Server Lokal
Jalankan server aplikasi:
```bash
npm start
```
Untuk mode pengembangan dengan pemuatan otomatis:
```bash
npm run dev
```
Akses antarmuka web melalui peramban di:
`http://localhost:3000`

---

## Pengujian Otomatis (Test Suite)

Repositori menggunakan test runner bawaan Node.js (`node:test`). Seluruh 33 pengujian mencakup sirkuit Visual TOTP, SDK, canvas renderer, CORS/CORP header, dan endpoint verifikasi visual OTP.

Jalankan seluruh pengujian:
```bash
npm test
```

Jalankan pengujian per modul:
```bash
# Uji spesifik Visual TOTP (Canvas, Worker, CORS, Nonce Burning, Drift)
npm run test:visual

# Uji integrasi dan unit ZK Canvas SDK
npm run test:sdk
```

---

## Kompilasi Ulang Sirkuit Circom (Opsional)

Jika Anda memodifikasi berkas sirkuit di `circuits/VisualTOTP.circom`, jalankan skrip kompilasi dan pembuatan proving key:
```bash
npm run compile:circuit
```

Skrip ini akan:
1. Mengompilasi sirkuit Circom menjadi constraint R1CS dan modul WASM.
2. Menghasilkan kontribusi Powers of Tau kurva BN254.
3. Melakukan fase kedua Groth16 untuk menghasilkan `VisualTOTP_final.zkey`.
4. Mengekspor berkas verifikasi `VisualTOTP_vkey.json`.
5. Menyinkronkan seluruh artefak build ke folder `client/public/zk/`.

---

## Ringkasan Struktur Direktori

```text
circuits/
  VisualTOTP.circom             Sirkuit 2FA Visual TOTP dinamis
  build/                        Artefak kompilasi (WASM, zkey, vkey)
  scripts/compile.sh            Skrip otomatisasi kompilasi sirkuit
client/
  index.html                    Antarmuka pengguna (Visual TOTP ZK Prover)
  src/
    main.js                     Logika antarmuka klien
    visualTotpCanvas.js         Generator matriks dan renderer canvas
    zkClientService.js          Layanan komunikasi Web Worker
    crypto/                     Fungsi visual pattern generator
    ui/matrixRenderer.js        Komponen renderer grid 8x8
  public/
    workers/zkWorker.js         Web Worker SnarkJS
    vendor/                     Pustaka snarkjs browser
    zk/                         Artefak sirkuit untuk browser (WASM, zkey, vkey)
sdk/
  src/                          TypeScript/ESM library ZK Canvas SDK
server/
  src/
    app.js                      Server Express, CORS/CORP header, dan routing
    authController.js           Controller verifikasi Visual TOTP & challenge
    nonceManager.js             Pengelola challenge nonce dan single-use burning ledger
    zkVerifier.js               Verifikasi Groth16 server-side
    rateLimiter.js              Pembatas laju permintaan IP
tests/
  visualTotp.test.js            Pengujian visual OTP, canvas, CORS, drift, dan nonce burn
  sdk.test.js                   Pengujian unit SDK
  sdkIntegration.test.js        Pengujian integrasi SDK
  helpers/                      Helper mock worker bridge untuk testing
```

---

## Lisensi

Proyek ini dilisensikan di bawah lisensi MIT.

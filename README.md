# 🔐 Zero-Knowledge Multi-Image Keyfile 2FA

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)

**🌐 Coba Demo Langsung (Gratis di GitHub Pages):**  
👉 **[https://de-violet.github.io/zk-multi-image-keyfile-2fa/](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)**

---

Sistem Otentikasi dan Pemulihan Akun berbasis **Zero-Knowledge Proofs (Groth16 zk-SNARKs & Circom 2.0)** menggunakan 3 berkas gambar pribadi sebagai kunci kriptografis.

Foto Anda **100% tidak pernah diunggah atau disimpan di server**. Browser WebAssembly menghitung bukti matematika secara lokal, sehingga server hanya memvalidasi keaslian bukti tanpa pernah mengetahui isi fotonya.

---

## 🚀 Alur Kerja Sistem

Aplikasi ini dibagi menjadi 3 langkah berurutan:

1. **1. Daftar Akun**  
   Pengguna mendaftarkan username, password, dan memilih 3 foto pribadi dari perangkat. Browser menghitung *Root Commitment* secara lokal dan menyimpannya di server sebagai pengaman akun.
2. **2. Login Akun & Pemulihan (Lupa Password)**  
   - **Login Harian**: Cukup masukkan username dan password.
   - **Skenario Lupa Password**: Pengguna dapat mereset password baru dengan membuktikan kepemilikan 3 foto kunci menggunakan ZK-Proof tanpa mengirim foto ke server.
3. **3. Verifier (ZKP Lab)**  
   Laboratorium interaktif untuk menguji 3 pilar ZKP:
   - **Witness**: Perhitungan saksi lokal dari 3 foto.
   - **Proof**: Sintesis bukti Groth16 256-byte ($\pi_A, \pi_B, \pi_C$).
   - **Verifier**: Validasi persamaan *bilinear pairing* (dilengkapi tombol *Tamper Test* untuk membuktikan penolakan bukti palsu).

---

## 🛠️ Cara Menjalankan (Lokal)

### 1. Pasang Dependensi
```bash
npm install
```

### 2. Jalankan Pengujian Otomatis (14 Test Passing)
```bash
npm test
```

### 3. Jalankan Server
```bash
npm start
```
Buka browser Anda di **`http://localhost:3000`**.

---

## 🌐 Teknologi Utama
- **Circom 2.0**: Perancangan sirkuit R1CS ZKP (~1.412 constraints)
- **SnarkJS**: Pustaka Groth16 Prover (WASM) & Verifier (Kurva BN254)
- **Poseidon Hash**: Hashing hierarkis hemat constraint kurva eliptik
- **Express.js**: Server otentikasi dengan Anti-Replay Nonce Management (TTL 60s)

## 🤝 Kontribusi
Tertarik berkontribusi? Silakan baca panduan lengkap di **[CONTRIBUTING.md](CONTRIBUTING.md)** untuk alur kerja pengembangan, ide fitur, dan pengiriman Pull Request.

---

## 📜 Lisensi
MIT License.


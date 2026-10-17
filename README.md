# Zero-Knowledge Multi-Image Keyfile 2FA & Visual TOTP

[![Tests](https://github.com/De-violet/zk-multi-image-keyfile-2fa/actions/workflows/deploy.yml/badge.svg)](https://github.com/De-violet/zk-multi-image-keyfile-2fa/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ZK Protocol](https://img.shields.io/badge/ZK-Groth16%20BN128-purple.svg)](circuits/VisualTOTP.circom)

Sistem Otentikasi dan Pemulihan Akun terdesentralisasi berbasis **Zero-Knowledge Proofs (Groth16 zk-SNARKs & Circom 2.0)** dengan faktor kedua berupa **Visual TOTP Dinamis (Siklus 35 Detik)**.

Kunci rahasia diproses secara 100% lokal di sisi peramban (WebAssembly & Web Worker). Server hanya memvalidasi keabsahan matematis dari bukti zero-knowledge tanpa pernah menerima, melihat, atau menyimpan kunci rahasia pengguna.

Demo Langsung: [https://de-violet.github.io/zk-multi-image-keyfile-2fa/](https://de-violet.github.io/zk-multi-image-keyfile-2fa/)

---

## Arsitektur Modular

Sistem ini dirancang terpisah menjadi dua sisi yang dapat langsung diintegrasikan oleh developer:

```text
├── circuits/      # Sirkuit Circom (Groth16 BN128) & Script Kompilasi
├── contracts/     # Solidity Smart Contract Verifier (EVM On-Chain)
├── sdk/           # Client SDK Browser/Frontend (ZkCanvasSDK, Web Worker, Canvas 8x8)
├── server/        # Server SDK Backend/REST API (Express Router, Middleware, SnarkJS Verifier)
└── demo/          # Developer Playground & Web Showcase (Terisolasi dari library inti)
```

---

## Instalasi

```bash
npm install zk-multi-image-keyfile-2fa
```

---

## 1. Integrasi Client SDK (Frontend / Browser)

Client SDK mengeksekusi komputasi Groth16 di latar belakang (Web Worker) dan merender matriks warna 8x8 (64 sel) berbasis palet 16-warna kontras tinggi.

```javascript
import { ZkCanvasSDK } from 'zk-multi-image-keyfile-2fa/client';

// 1. Inisialisasi SDK
const sdk = new ZkCanvasSDK({
  secret: 'master-user-secret-12345',
  canvas: document.getElementById('totpCanvas'), // HTMLCanvasElement (180x180)
  rotationIntervalMs: 35000,                    // Siklus rotasi 35 detik
  assetBaseUrl: '/zk/',                         // Lokasi VisualTOTP.wasm & zkey
  workerScriptUrl: '/sdk/workerScript.js'
});

// 2. Berlangganan Event Real-time
sdk.on('tick', ({ remainingMs, currentWindow }) => {
  const secondsLeft = Math.ceil(remainingMs / 1000);
  console.log(`Window #${currentWindow} - Sisa: ${secondsLeft}s`);
});

sdk.on('patternChange', ({ window, matrix }) => {
  console.log(`Pola matriks 64-sel baru dirender untuk window #${window}`);
});

sdk.start();

// 3. Sintesis ZK-Proof saat Autentikasi
async function handleLogin(serverNonce) {
  // Komputasi Groth16 dieksekusi di Web Worker tanpa memblokir UI thread
  const { proof, publicSignals, durationMs } = await sdk.generateProof(serverNonce);

  // Kirim bukti ke server
  const response = await fetch('/api/zk-auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      sessionNonce: serverNonce,
      proof,
      publicSignals,
      clientTimeWindow: sdk.getCurrentWindow()
    })
  });

  return await response.json();
}
```

---

## 2. Integrasi Server SDK (Backend / Express)

Server SDK memverifikasi bukti kriptografi Groth16, menerapkan *single-use nonce burning* untuk menangkal *replay attack*, dan memvalidasi batas toleransi *time drift* ($\pm 1$ jendela waktu).

### Opsi A: Plug-and-Play REST API Router (Rekomendasi)

Pasang seluruh endpoint challenge dan verifikasi secara instan dengan 1 baris kode:

```javascript
import express from 'express';
import { createZkAuthRouter } from 'zk-multi-image-keyfile-2fa/server';

const app = express();
app.use(express.json());

// Pasang rute REST API
app.use('/api/zk-auth', createZkAuthRouter({
  intervalSec: 35,
  onSuccess: async (username, req) => {
    // Callback opsional saat pembuktian valid: terbitkan token sesi
    return { token: 'jwt-or-session-token', role: 'user' };
  }
}));

app.listen(3000, () => console.log('Server berjalan di port 3000'));
```

### Opsi B: Express Middleware Kustom dengan Storage Adapter (Redis/Memory)

Gunakan middleware untuk melindungi rute tertentu dan sesuaikan storage nonce (misal via Redis):

```javascript
import { 
  visualTotpMiddleware, 
  issueVisualNonce, 
  MemoryNonceStore 
} from 'zk-multi-image-keyfile-2fa/server';

// Opsional: Integrasikan Redis Nonce Store (atau gunakan MemoryNonceStore bawaan)
const redisNonceStore = {
  get: async (nonce) => JSON.parse(await redisClient.get(`zk:nonce:${nonce}`)),
  set: async (nonce, data, ttlMs) => redisClient.set(`zk:nonce:${nonce}`, JSON.stringify(data), 'PX', ttlMs),
  delete: async (nonce) => redisClient.del(`zk:nonce:${nonce}`)
};

// 1. Endpoint untuk meminta challenge nonce sekali pakai
app.post('/api/auth/challenge', async (req, res) => {
  const nonce = issueVisualNonce(req.body.username, 35000, redisNonceStore);
  res.json({ sessionNonce: nonce });
});

// 2. Rute terproteksi yang divalidasi via ZK Proof
app.post('/api/vault/unlock', visualTotpMiddleware({ 
  intervalSec: 35, 
  nonceStore: redisNonceStore 
}), (req, res) => {
  res.json({
    status: 'Unlocked',
    visualKey: req.session.imageCommitment
  });
});
```

### Opsi C: Direct Function Verifier (Tanpa Framework)

```javascript
import { verifyVisualTotpProof } from 'zk-multi-image-keyfile-2fa/server';

const verification = await verifyVisualTotpProof({
  proof,
  publicSignals,
  clientTimeWindow,
  sessionNonce,
  intervalSec: 35
});

if (verification.valid) {
  console.log(`Proof sah! Durasi verifikasi: ${verification.durationMs}ms`);
} else {
  console.error(`Ditolak: ${verification.error}`);
}
```

---

## Spesifikasi REST API

### 1. `POST /api/zk-auth/challenge`
Meminta challenge nonce sesi satu kali pakai (TTL 35 detik).

**Request Body:**
```json
{
  "username": "alice"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "sessionNonce": "1489248239048209384023948203948",
  "intervalSec": 35
}
```

### 2. `POST /api/zk-auth/verify`
Memvalidasi Snark Groth16 proof dan sinyal publik klien.

**Request Body:**
```json
{
  "username": "alice",
  "sessionNonce": "1489248239048209384023948203948",
  "clientTimeWindow": 50642180,
  "proof": {
    "pi_a": ["0x...", "0x...", "0x01"],
    "pi_b": [["0x...", "0x..."], ["0x...", "0x..."], ["0x01", "0x00"]],
    "pi_c": ["0x...", "0x...", "0x01"]
  },
  "publicSignals": [
    "784192837192837192837192837192",
    "128938129038102938102938120938",
    "981293810293810293810293810293",
    "50642180",
    "1489248239048209384023948203948"
  ]
}
```

> **Urutan Sinyal Publik (`nPublic: 5`):**
> 1. `rootCommitment` — $Poseidon(masterSecret)$ (pengikatan identitas akun statis ke database)
> 2. `imageCommitment` — $Poseidon(masterSecret, timeWindow)$ (kunci visual 8×8 jendela aktif)
> 3. `sessionAuthToken` — $Poseidon(imageCommitment, serverNonce)$ (token otentikasi sesi)
> 4. `timeWindow` — Indeks jendela waktu publik
> 5. `serverNonce` — Challenge nonce acak sekali pakai dari server

**Response (200 OK):**
```json
{
  "success": true,
  "visualKey": "128938129038102938102938120938",
  "durationMs": 4.12,
  "token": "jwt-session-token"
}
```

---

## Verifikasi On-Chain (Solidity Smart Contract)

Untuk integrasi Web3/EVM on-chain, kontrak verifikasi Groth16 telah diekspor:
- Berkas: [`contracts/VisualTOTPVerifier.sol`](contracts/VisualTOTPVerifier.sol)
- Ekspor ulang kontrak dari proving key:
  ```bash
  npm run export:solidity
  ```

---

## Basis Data Produksi & Migrasi SQL

Skema tabel SQL baku untuk PostgreSQL / SQLite / MySQL tersedia di:
- [`server/data/schema.sql`](server/data/schema.sql)
  - Tabel `users` (`username`, `root_commitment`, `password_hash`, `salt_2fa`)
  - Tabel `visual_totp_sessions` (pelacakan nonce satu kali pakai, masa berlaku, dan anti-replay)

---

## Menjalankan Proyek & Pengujian

```bash
# 1. Jalankan pengujian otomatis (33 unit & integration tests)
npm test

# 2. Build distribusi SDK
npm run build:sdk

# 3. Jalankan server demo lokal
npm start
```

Akses demo lokal di `http://localhost:3000`.

---

## Lisensi

Didistribusikan di bawah lisensi [MIT](LICENSE).

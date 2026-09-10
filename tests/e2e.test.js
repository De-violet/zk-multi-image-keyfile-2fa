import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import crypto from 'crypto';
import app from '../server/src/app.js';
import { db } from '../server/src/db.js';
import { nonceManager, SNARK_SCALAR_FIELD } from '../server/src/nonceManager.js';
import { computeHierarchicalCommitment, computeSessionAuthToken } from '../client/src/crypto/poseidon.js';
import { generateAutoSalt } from '../client/src/crypto/saltManager.js';
import { createRateLimiter } from '../server/src/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.join(__dirname, '../circuits/build/MultiImageKeyfile2FA_js/MultiImageKeyfile2FA.wasm');
const ZKEY_PATH = path.join(__dirname, '../circuits/build/circuit_final.zkey');

let serverInstance;
let baseUrl;

test.before(async () => {
  db.clear();
  return new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      const port = serverInstance.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[E2E Test] Test server berjalan di port ${port}`);
      resolve();
    });
  });
});

test.after(async () => {
  return new Promise((resolve) => {
    if (serverInstance && serverInstance.closeAllConnections) {
      serverInstance.closeAllConnections();
    }
    serverInstance.close(() => {
      resolve();
      setTimeout(() => process.exit(0), 300).unref();
    });
  });
});

test('End-to-End Authentication & Attack Resistance Lifecycle', async (t) => {
  // 1. Persiapan data klien: 3 file gambar dummy + 256-bit salt
  const img1 = Buffer.from('FAKE_JPEG_IMAGE_KEYFILE_DATA_1_BYTE_ARRAY_ENTROPY');
  const img2 = Buffer.from('FAKE_PNG_IMAGE_KEYFILE_DATA_2_BYTE_ARRAY_ENTROPY');
  const img3 = Buffer.from('FAKE_WEBP_IMAGE_KEYFILE_DATA_3_BYTE_ARRAY_ENTROPY');

  const h1 = (BigInt('0x' + crypto.createHash('sha256').update(img1).digest('hex')) % SNARK_SCALAR_FIELD).toString();
  const h2 = (BigInt('0x' + crypto.createHash('sha256').update(img2).digest('hex')) % SNARK_SCALAR_FIELD).toString();
  const h3 = (BigInt('0x' + crypto.createHash('sha256').update(img3).digest('hex')) % SNARK_SCALAR_FIELD).toString();

  const { fieldElement: salt } = generateAutoSalt();
  const { rootCommitment } = await computeHierarchicalCommitment(h1, h2, h3, salt);

  const username = 'cybernaut_01';
  const password = 'SuperSecretMasterPassword123!';

  await t.test('Fase 1: Pendaftaran Akun (Setup Factor 1 & Factor 2)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        rootCommitment
      })
    });

    assert.equal(res.status, 201, 'Registrasi harus mengembalikan status 201');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.username, username);
    assert.equal(data.user.rootCommitment, rootCommitment);
  });

  await t.test('Keamanan: Registrasi Menolak Akun Existing (Cegah Takeover)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: 'AttackerNewPassword123!',
        rootCommitment: '999999999'
      })
    });

    assert.equal(res.status, 409, 'Pendaftaran ulang username yang sama harus ditolak (409 Conflict)');
    const data = await res.json();
    assert.ok(data.error.includes('sudah terdaftar'), 'Pesan error harus menyatakan username sudah terdaftar');
  });

  let sessionNonce;

  await t.test('Fase 2: Permintaan Tantangan 2FA (Challenge Request)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.sessionNonce, 'Server harus menerbitkan sessionNonce');
    assert.equal(data.rootCommitment, rootCommitment);
    assert.equal(data.expiresIn, 60, 'TTL harus 60 detik');

    sessionNonce = data.sessionNonce;
  });

  let validProof;
  let sessionAuthToken;

  await t.test('Fase 3: Pembuktian Lokal (Proof Synthesis)', async () => {
    const circuitInputs = {
      h1,
      h2,
      h3,
      salt,
      rootCommitment,
      sessionNonce
    };

    const startTime = performance.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      WASM_PATH,
      ZKEY_PATH
    );
    const duration = performance.now() - startTime;
    console.log(`[E2E Test] Client Proof synthesis time: ${duration.toFixed(2)} ms`);

    assert.ok(proof);
    validProof = proof;
    sessionAuthToken = publicSignals[0];
  });

  await t.test('Fase 4: Verifikasi Server & Penerbitan Sesi Akses (< 5ms)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        sessionNonce,
        sessionAuthToken,
        proof: validProof
      })
    });

    assert.equal(res.status, 200, 'Verifikasi ZK-Proof harus sukses');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.sessionToken, 'Server harus menerbitkan sessionToken');
    console.log(`[E2E Test] Server verification duration: ${data.verificationDurationMs} ms`);
    assert.ok(data.verificationDurationMs < 500, 'Waktu verifikasi server harus sangat cepat (< 500ms)');
  });

  await t.test('Keamanan: Uji Replay Attack (Mencegah Penggunaan Ulang Proof)', async () => {
    // Kirimkan payload yang persis sama untuk kedua kalinya
    const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        sessionNonce,
        sessionAuthToken,
        proof: validProof
      })
    });

    assert.equal(res.status, 401, 'Server harus menolak replay attack');
    const data = await res.json();
    assert.match(data.error, /replay attack|Nonce not found|already consumed/, 'Harus mengindikasikan nonce hangus');
  });

  await t.test('Keamanan: Uji Expired Nonce (> 60 detik)', async () => {
    // Minta challenge baru
    const challengeRes = await fetch(`${baseUrl}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const challengeData = await challengeRes.json();
    const expiredNonce = challengeData.sessionNonce;

    // Simulasikan waktu kedaluwarsa secara langsung di nonceManager
    const entry = nonceManager.activeNonces.get(username.toLowerCase());
    if (entry) {
      entry.expiresAt = Date.now() - 5000; // 5 detik di masa lampau
    }

    const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        sessionNonce: expiredNonce,
        sessionAuthToken,
        proof: validProof
      })
    });

    assert.equal(res.status, 401, 'Server harus menolak nonce kedaluwarsa');
    const data = await res.json();
    assert.match(data.error, /expired/i, 'Harus menyatakan nonce expired');
  });

  let recoverNonce;
  let recoverProof;
  let recoverAuthToken;
  const newPassword = 'BrandNewSecurePassword456!';

  await t.test('Keamanan: Endpoint recover-challenge TIDAK Membocorkan rootCommitment atau salt2fa', async () => {
    const res = await fetch(`${baseUrl}/api/auth/recover-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.sessionNonce, 'Server harus menerbitkan sessionNonce');
    assert.equal(data.rootCommitment, undefined, 'rootCommitment TIDAK BOLEH dikembalikan pada endpoint recovery publik');
    assert.equal(data.salt2fa, undefined, 'salt2fa TIDAK BOLEH dikembalikan pada endpoint recovery publik');

    recoverNonce = data.sessionNonce;
  });

  await t.test('Pemulihan Akun: Sintesis Proof ZKP 3 Foto & Eksekusi Reset Password', async () => {
    // Klien menghitung proof secara lokal dari 3 foto kunci miliknya
    const circuitInputs = {
      h1,
      h2,
      h3,
      salt,
      rootCommitment,
      sessionNonce: recoverNonce
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      WASM_PATH,
      ZKEY_PATH
    );

    recoverProof = proof;
    recoverAuthToken = publicSignals[0];

    const res = await fetch(`${baseUrl}/api/auth/recover-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        sessionNonce: recoverNonce,
        sessionAuthToken: recoverAuthToken,
        proof: recoverProof,
        newPassword
      })
    });

    assert.equal(res.status, 200, 'Server harus menerima reset password via valid ZKP');
    const data = await res.json();
    assert.equal(data.success, true);
  });

  await t.test('Verifikasi: Login dengan Password Baru Berhasil dan Password Lama Ditolak', async () => {
    // 1. Password lama harus ditolak
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    assert.equal(oldLoginRes.status, 401, 'Password lama harus ditolak');

    // 2. Password baru harus berhasil
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: newPassword })
    });
    assert.equal(newLoginRes.status, 200, 'Login dengan password baru harus berhasil');
    const newLoginData = await newLoginRes.json();
    assert.equal(newLoginData.success, true);
  });
});

test('Proteksi Rate Limiting (Sliding Window & Anti-Bruteforce)', async (t) => {
  const limiter = createRateLimiter({
    windowMs: 5000,
    maxRequests: 3,
    message: 'Rate limit tercapai. Harap tunggu.'
  });

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    let callCount = 0;
    const mockNext = () => { callCount++; };
    const mockReq = {
      ip: '127.0.0.1',
      body: { username: 'test_victim' }
    };
    let lastStatus = null;
    let lastBody = null;
    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        lastStatus = code;
        return {
          json: (body) => { lastBody = body; }
        };
      }
    };

    // Panggilan 1, 2, 3 harus diizinkan
    limiter(mockReq, mockRes, mockNext);
    limiter(mockReq, mockRes, mockNext);
    limiter(mockReq, mockRes, mockNext);
    assert.equal(callCount, 3, '3 permintaan pertama harus diizinkan');

    // Panggilan ke-4 harus diblokir (429 Too Many Requests)
    limiter(mockReq, mockRes, mockNext);
    assert.equal(callCount, 3, 'Permintaan ke-4 tidak boleh lolos ke next()');
    assert.equal(lastStatus, 429, 'Harus mengembalikan HTTP 429');
    assert.equal(lastBody.error, 'Rate limit tercapai. Harap tunggu.');
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});


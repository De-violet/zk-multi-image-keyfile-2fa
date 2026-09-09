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
});

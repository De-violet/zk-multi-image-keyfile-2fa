import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import { SNARK_SCALAR_FIELD } from '../server/src/nonceManager.js';
import { computeHierarchicalCommitment, computeSessionAuthToken } from '../client/src/crypto/poseidon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.join(__dirname, '../circuits/build/MultiImageKeyfile2FA_js/MultiImageKeyfile2FA.wasm');
const ZKEY_PATH = path.join(__dirname, '../circuits/build/circuit_final.zkey');
const VKEY_PATH = path.join(__dirname, '../circuits/build/verification_key.json');

test('Circom Circuit & Groth16 Proof Synthesis and Verification', async (t) => {
  const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, 'utf-8'));

  // Input sampel 3 gambar dan salt
  const h1 = '111111111111111111111111111111111111111111111111111111111111111';
  const h2 = '222222222222222222222222222222222222222222222222222222222222222';
  const h3 = '333333333333333333333333333333333333333333333333333333333333333';
  const salt = '9876543210987654321098765432109876543210987654321';
  const sessionNonce = '4242424242424242424242424242424242424242';

  const { masterKey, rootCommitment } = await computeHierarchicalCommitment(h1, h2, h3, salt);
  const expectedAuthToken = await computeSessionAuthToken(masterKey, sessionNonce);

  await t.test('1. Menghasilkan dan memverifikasi proof valid', async () => {
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
    console.log(`[Circuit Test] Waktu sintesis ZK-Proof Groth16: ${duration.toFixed(2)} ms`);

    assert.ok(proof, 'Proof harus berhasil di-generate');
    assert.equal(publicSignals.length, 3, 'Harus ada 3 sinyal publik');

    // Index 0: sessionAuthToken
    // Index 1: rootCommitment
    // Index 2: sessionNonce
    assert.equal(publicSignals[0], expectedAuthToken, 'Output sessionAuthToken harus cocok dengan komputasi Poseidon');
    assert.equal(publicSignals[1], rootCommitment, 'Public signal rootCommitment harus cocok');
    assert.equal(publicSignals[2], sessionNonce, 'Public signal sessionNonce harus cocok');

    // Verifikasi proof dengan verification_key.json
    const verifyStart = performance.now();
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    const verifyDuration = performance.now() - verifyStart;
    console.log(`[Circuit Test] Waktu verifikasi Groth16 di server: ${verifyDuration.toFixed(2)} ms (< 5ms target)`);

    assert.equal(isValid, true, 'Proof harus dinyatakan valid oleh verifier');
  });

  await t.test('2. Menolak proof jika salah satu gambar kunci salah (Zero-Noise Tolerance)', async () => {
    const wrongH1 = (BigInt(h1) + 1n).toString();
    const badInputs = {
      h1: wrongH1,
      h2,
      h3,
      salt,
      rootCommitment, // Komitmen lama, tapi h1 diubah
      sessionNonce
    };

    await assert.rejects(
      async () => {
        await snarkjs.groth16.fullProve(badInputs, WASM_PATH, ZKEY_PATH);
      },
      /Assert Failed|Error in template MultiImageKeyfile2FA/,
      'Sirkuit harus menolak komputasi witness karena constraint gagal memenuhi rootCommitment'
    );
  });

  await t.test('3. Menolak verifikasi jika sessionNonce publik dipalsukan (Tamper Detection)', async () => {
    const circuitInputs = {
      h1,
      h2,
      h3,
      salt,
      rootCommitment,
      sessionNonce
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      WASM_PATH,
      ZKEY_PATH
    );

    // Manipulasi sessionNonce pada sinyal publik yang dikirim ke verifier
    const forgedNonce = '999999999999999999999';
    const forgedPublicSignals = [
      publicSignals[0],
      publicSignals[1],
      forgedNonce
    ];

    const isValid = await snarkjs.groth16.verify(vKey, forgedPublicSignals, proof);
    assert.equal(isValid, false, 'Verifier harus menolak proof jika sessionNonce dipalsukan');
  });
});

test.after(() => {
  setTimeout(() => process.exit(0), 300).unref();
});


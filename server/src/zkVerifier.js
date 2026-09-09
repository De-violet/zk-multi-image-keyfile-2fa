import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lokasi verification_key.json
const VKEY_PATH = path.join(__dirname, '../../circuits/build/verification_key.json');

let vKey = null;

function loadVerificationKey() {
  if (!vKey) {
    if (!fs.existsSync(VKEY_PATH)) {
      throw new Error(`Verification key tidak ditemukan di ${VKEY_PATH}. Pastikan sirkuit sudah dikompilasi (npm run compile:circuit).`);
    }
    vKey = JSON.parse(fs.readFileSync(VKEY_PATH, 'utf-8'));
  }
  return vKey;
}

/**
 * Memverifikasi Groth16 Zero-Knowledge Proof
 * @param {string} sessionAuthToken - Output publik token sesi dari sirkuit Poseidon(masterKey, sessionNonce)
 * @param {string} rootCommitment - Root commitment pengguna terdaftar
 * @param {string} sessionNonce - Nonce sesi berbatas waktu
 * @param {object} proof - Objek Groth16 proof (pi_a, pi_b, pi_c)
 * @returns {Promise<{ valid: boolean, durationMs: number, error?: string }>}
 */
export async function verifyZkProof(sessionAuthToken, rootCommitment, sessionNonce, proof) {
  const startTime = performance.now();
  try {
    const key = loadVerificationKey();

    // Pastikan format publicSignals sesuai dengan deklarasi sirkuit Circom:
    // Index 0: sessionAuthToken (output signal)
    // Index 1: rootCommitment (public input)
    // Index 2: sessionNonce (public input)
    const publicSignals = [
      sessionAuthToken.toString(),
      rootCommitment.toString(),
      sessionNonce.toString()
    ];

    const isValid = await snarkjs.groth16.verify(key, publicSignals, proof);
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));

    return {
      valid: isValid,
      durationMs
    };
  } catch (err) {
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));
    return {
      valid: false,
      durationMs,
      error: err.message
    };
  }
}

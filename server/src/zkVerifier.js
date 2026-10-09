import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lokasi berkas verification key
const VISUAL_VKEY_PATH = path.join(__dirname, '../../circuits/build/VisualTOTP_vkey.json');
const CLIENT_VISUAL_VKEY_PATH = path.join(__dirname, '../../client/public/zk/VisualTOTP_vkey.json');

let visualVKey = null;

export function loadVisualVerificationKey() {
  if (!visualVKey) {
    const target = fs.existsSync(VISUAL_VKEY_PATH) ? VISUAL_VKEY_PATH : CLIENT_VISUAL_VKEY_PATH;
    if (!fs.existsSync(target)) {
      throw new Error(`Visual verification key tidak ditemukan di ${target}.`);
    }
    visualVKey = JSON.parse(fs.readFileSync(target, 'utf-8'));
  }
  return visualVKey;
}

/**
 * Memverifikasi Visual TOTP ZK-Proof dengan toleransi drift waktu ±1 siklus
 * @param {object} params
 * @param {object} params.proof - Objek Groth16 proof
 * @param {string[]} params.publicSignals - [imageCommitment, sessionAuthToken, timeWindow, serverNonce]
 * @param {number|string} params.clientTimeWindow - Jendela waktu dari klien
 * @param {string} params.sessionNonce - Challenge nonce dari server
 * @param {number} [params.intervalSec=60] - Interval siklus waktu
 * @returns {Promise<{ valid: boolean, durationMs: number, error?: string }>}
 */
export async function verifyVisualTotpProof({
  proof,
  publicSignals,
  clientTimeWindow,
  sessionNonce,
  intervalSec = 60
}) {
  const startTime = performance.now();
  try {
    // 1. Pengecekan toleransi jendela waktu (±1 siklus)
    const currentWindow = Math.floor(Date.now() / 1000 / intervalSec);
    const windowDiff = Math.abs(Number(clientTimeWindow) - currentWindow);
    if (windowDiff > 1) {
      return {
        valid: false,
        durationMs: parseFloat((performance.now() - startTime).toFixed(2)),
        error: `Time drift melebihi batas ±1 siklus (drift: ${windowDiff} window).`
      };
    }

    // 2. Verifikasi konsistensi parameter publik
    if (
      publicSignals[2].toString() !== clientTimeWindow.toString() ||
      publicSignals[3].toString() !== sessionNonce.toString()
    ) {
      return {
        valid: false,
        durationMs: parseFloat((performance.now() - startTime).toFixed(2)),
        error: 'Public signals tidak cocok dengan timeWindow atau sessionNonce.'
      };
    }

    // 3. Verifikasi kriptografi Groth16 menggunakan VisualTOTP_vkey.json
    const key = loadVisualVerificationKey();
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

/**
 * Memverifikasi Groth16 Zero-Knowledge Proof (Keyfile statis legacy)
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

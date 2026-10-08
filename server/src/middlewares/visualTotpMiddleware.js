import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import * as snarkjs from 'snarkjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory store untuk server nonce challenge dengan TTL
export const visualNonceStore = new Map();

/**
 * Menghasilkan challenge nonce unik untuk sesi klien.
 * @param {string} sessionId
 * @param {number} ttlMs (default: 60 detik)
 * @returns {string}
 */
export function issueVisualNonce(sessionId, ttlMs = 60000) {
  // Field element BN128 representasi angka bulat
  const rawBytes = crypto.randomBytes(16);
  const nonce = BigInt('0x' + rawBytes.toString('hex')).toString();

  visualNonceStore.set(nonce, {
    sessionId,
    expiresAt: Date.now() + ttlMs
  });
  return nonce;
}

// Cache berkas verification key
let cachedVKey = null;

export function loadVerificationKey(customPath = null) {
  if (cachedVKey) return cachedVKey;

  const defaultPath = path.resolve(__dirname, '../../../circuits/build/VisualTOTP_vkey.json');
  const targetPath = customPath || defaultPath;

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Verification key tidak ditemukan pada ${targetPath}`);
  }

  cachedVKey = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  return cachedVKey;
}

/**
 * Middleware Express untuk memvalidasi proof ZK Visual TOTP.
 * @param {object} options
 * @param {string} [options.vKeyPath]
 * @param {number} [options.intervalSec] (default: 60 detik)
 */
export function visualTotpMiddleware(options = {}) {
  const { vKeyPath = null, intervalSec = 60 } = options;

  return async (req, res, next) => {
    try {
      const { proof, publicSignals, clientTimeWindow, nonce } = req.body;

      if (!proof || !publicSignals || clientTimeWindow === undefined || !nonce) {
        return res.status(400).json({
          success: false,
          error: 'Payload tidak lengkap: proof, publicSignals, clientTimeWindow, dan nonce wajib disertakan.'
        });
      }

      const nonceStr = nonce.toString();
      const nonceRecord = visualNonceStore.get(nonceStr);

      // 1. Validasi Keberadaan dan TTL Nonce
      if (!nonceRecord) {
        return res.status(403).json({
          success: false,
          error: 'Nonce tidak valid atau sudah pernah digunakan.'
        });
      }

      if (Date.now() > nonceRecord.expiresAt) {
        visualNonceStore.delete(nonceStr);
        return res.status(403).json({
          success: false,
          error: 'Nonce telah kadaluarsa.'
        });
      }

      // 2. Toleransi Time Drift (±1 jendela waktu 60 detik)
      const currentServerWindow = Math.floor(Date.now() / 1000 / intervalSec);
      const windowDiff = Math.abs(Number(clientTimeWindow) - currentServerWindow);

      if (windowDiff > 1) {
        visualNonceStore.delete(nonceStr);
        return res.status(401).json({
          success: false,
          error: `Time drift melebihi batas toleransi ±1 interval (drift: ${windowDiff}). Periksa jam sistem.`
        });
      }

      // 3. Verifikasi Konsistensi Parameter Publik
      // Urutan publicSignals sirkuit Circom VisualTOTP:
      // [0] imageCommitment (output)
      // [1] sessionAuthToken (output)
      // [2] timeWindow (public input)
      // [3] serverNonce (public input)
      const [imageCommitment, sessionAuthToken, signalTimeWindow, signalServerNonce] = publicSignals;

      if (
        signalTimeWindow.toString() !== clientTimeWindow.toString() ||
        signalServerNonce.toString() !== nonceStr
      ) {
        visualNonceStore.delete(nonceStr);
        return res.status(400).json({
          success: false,
          error: 'Parameter publik pada proof tidak cocok dengan timeWindow atau nonce sesi.'
        });
      }

      // 4. Verifikasi Groth16 Proof
      const vKey = loadVerificationKey(vKeyPath);
      const isProofValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

      if (!isProofValid) {
        visualNonceStore.delete(nonceStr);
        return res.status(401).json({
          success: false,
          error: 'Verifikasi ZK Proof gagal: cryptographic proof invalid.'
        });
      }

      // 5. Konsumsi Nonce (Anti-Replay) & Catat Sesi Berhasil
      visualNonceStore.delete(nonceStr);

      req.session = req.session || {};
      req.session.is2FAVerified = true;
      req.session.verifiedAt = Date.now();
      req.session.imageCommitment = imageCommitment;
      req.session.sessionAuthToken = sessionAuthToken;

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Kesalahan internal pada verifikasi ZK: ${err.message}`
      });
    }
  };
}

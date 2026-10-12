import { Router } from 'express';
import { issueVisualNonce } from './middlewares/visualTotpMiddleware.js';
import { verifyVisualTotpProof } from './zkVerifier.js';
import { createRateLimiter } from './rateLimiter.js';

/**
 * Membuat router Express REST API plug-and-play untuk autentikasi ZK Visual TOTP.
 *
 * @param {object} [options]
 * @param {number} [options.intervalSec=35] - Jendela rotasi waktu dalam detik
 * @param {string} [options.vKeyPath] - Lokasi opsional berkas VisualTOTP_vkey.json
 * @param {Function} [options.onSuccess] - Callback opsional saat pembuktian valid (username, req) => token|payload
 * @returns {Router}
 */
export function createZkAuthRouter(options = {}) {
  const router = Router();
  const intervalSec = options.intervalSec || 35;

  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Terlalu banyak permintaan autentikasi ZK. Coba lagi dalam 1 menit.'
  });

  // 1. Endpoint Challenge Nonce
  router.post('/challenge', limiter, (req, res) => {
    const { username } = req.body || {};
    const sessionNonce = issueVisualNonce(username || 'anonymous', intervalSec * 1000);
    res.json({
      success: true,
      sessionNonce,
      intervalSec
    });
  });

  // 2. Endpoint Verifikasi Proof
  router.post('/verify', limiter, async (req, res) => {
    const { username, sessionNonce, proof, publicSignals, clientTimeWindow } = req.body || {};

    if (!proof || !publicSignals || !sessionNonce || clientTimeWindow === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Parameter tidak lengkap: proof, publicSignals, sessionNonce, dan clientTimeWindow wajib disertakan.'
      });
    }

    const result = await verifyVisualTotpProof({
      proof,
      publicSignals,
      clientTimeWindow,
      sessionNonce,
      intervalSec
    });

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: result.error || 'Pembuktian Zero-Knowledge ditolak.'
      });
    }

    let payload = { valid: true };
    if (typeof options.onSuccess === 'function') {
      payload = await options.onSuccess(username, req);
    }

    res.json({
      success: true,
      visualKey: publicSignals[0],
      durationMs: result.durationMs,
      ...payload
    });
  });

  // 3. Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ZK-Visual-TOTP-API' });
  });

  return router;
}

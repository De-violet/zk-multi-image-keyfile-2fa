/**
 * Backend SDK: ZK-OTP & Visual Keyfile Verifier
 * Menyediakan middleware Express, verifikasi Groth16, challenge/nonce management,
 * dan sinkronisasi jendela waktu TOTP.
 */

export {
  visualTotpMiddleware,
  issueVisualNonce,
  visualNonceStore,
  loadVerificationKey
} from './middlewares/visualTotpMiddleware.js';

export {
  verifyVisualTotpProof,
  verifyZkProof,
  loadVisualVerificationKey
} from './zkVerifier.js';

export { createRateLimiter } from './rateLimiter.js';
export { calculateTimeWindow, calculateRemainingMs, calculateNextWindowTimestamp } from '../../sdk/src/core/timeWindow.js';

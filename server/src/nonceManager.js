import crypto from 'crypto';

// BN254 scalar field order (r)
export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// TTL 60 detik (dalam milidetik)
const NONCE_TTL_MS = 60 * 1000;

class NonceManager {
  constructor() {
    // Map: username -> { nonce: string, expiresAt: number }
    this.activeNonces = new Map();
    // Map: string (nonce value) -> burnedAt timestamp (anti-replay ledger berbatas TTL)
    this.burnedNonces = new Map();

    // Pembersihan berkala setiap 30 detik
    setInterval(() => this.cleanup(), 30000).unref();
  }

  /**
   * Menerbitkan nonce acak 256-bit cryptographically secure untuk pengguna
   */
  issueNonce(username) {
    const userKey = username.toLowerCase();
    
    // Hasilkan 32 byte entropy
    const randomHex = crypto.randomBytes(32).toString('hex');
    // Reduksi modulo BN254 field
    const nonceBigInt = BigInt('0x' + randomHex) % SNARK_SCALAR_FIELD;
    const nonce = nonceBigInt.toString();

    const expiresAt = Date.now() + NONCE_TTL_MS;

    this.activeNonces.set(userKey, { nonce, expiresAt });

    return {
      sessionNonce: nonce,
      expiresIn: Math.floor(NONCE_TTL_MS / 1000),
      expiresAt
    };
  }

  /**
   * Validasi nonce dan lakukan single-use burn seketika
   * Aman dari DoS (hanya membakar nonce jika cocok) dan anti-replay
   */
  validateAndBurn(username, clientNonce) {
    const userKey = username.toLowerCase();
    const clientNonceStr = clientNonce ? clientNonce.toString() : '';

    // 1. Cek apakah nonce ini sudah pernah digunakan/dibakar (anti-replay)
    if (this.burnedNonces.has(clientNonceStr)) {
      return { valid: false, reason: 'Nonce has already been burned (replay attack detected)' };
    }

    const entry = this.activeNonces.get(userKey);
    if (!entry) {
      return { valid: false, reason: 'Nonce not found or already consumed' };
    }

    // 2. Cek kesesuaian nilai tanpa menghanguskan sesi jika nonce salah (Anti-DoS)
    if (entry.nonce !== clientNonceStr) {
      return { valid: false, reason: 'Invalid session nonce for user' };
    }

    // 3. Cek apakah sudah expired
    if (Date.now() > entry.expiresAt) {
      this.activeNonces.delete(userKey);
      return { valid: false, reason: 'Session nonce has expired (> 60 seconds)' };
    }

    // 4. Nonce valid, cocok, dan fresh -> Hanguskan seketika (Single-use burn)
    this.activeNonces.delete(userKey);
    this.burnedNonces.set(clientNonceStr, Date.now());

    return { valid: true };
  }

  getActiveNonce(username) {
    const entry = this.activeNonces.get(username.toLowerCase());
    if (entry && Date.now() <= entry.expiresAt) {
      return entry.nonce;
    }
    return null;
  }

  cleanup() {
    const now = Date.now();
    for (const [user, entry] of this.activeNonces.entries()) {
      if (now > entry.expiresAt) {
        this.activeNonces.delete(user);
      }
    }

    // Bersihkan burned nonces yang sudah melampaui masa TTL (mencegah memory leak)
    for (const [nonce, burnedAt] of this.burnedNonces.entries()) {
      if (now - burnedAt > NONCE_TTL_MS) {
        this.burnedNonces.delete(nonce);
      }
    }
  }
}

export const nonceManager = new NonceManager();

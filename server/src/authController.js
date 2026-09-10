import crypto from 'crypto';
import { db } from './db.js';
import { nonceManager, SNARK_SCALAR_FIELD } from './nonceManager.js';
import { verifyZkProof } from './zkVerifier.js';
import { sessionManager } from './sessionManager.js';

// Helper validasi input
function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username harus berupa teks.';
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return 'Panjang username harus antara 3 hingga 32 karakter.';
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return 'Username hanya boleh mengandung huruf, angka, tanda hubung (-), dan garis bawah (_).';
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password harus berupa teks.';
  if (password.length < 6) return 'Password minimal 6 karakter.';
  return null;
}

function validateBN254Field(val, fieldName = 'Nilai') {
  if (!val) return `${fieldName} tidak boleh kosong.`;
  try {
    const bn = BigInt(val.toString());
    if (bn < 0n || bn >= SNARK_SCALAR_FIELD) {
      return `${fieldName} harus berada dalam rentang elemen medan skalar BN254.`;
    }
  } catch (e) {
    return `${fieldName} bukan format numerik BN254 yang valid.`;
  }
  return null;
}

// Helper untuk hashing password F1 di server dengan salt acak per pengguna (PBKDF2)
function hashPassword(password, salt) {
  if (!salt) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}

/**
 * Middleware untuk memvalidasi Bearer Session Token
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Akses ditolak: Diperlukan header Authorization dengan format Bearer <token>.' });
  }

  const token = authHeader.slice(7).trim();
  const sessionStatus = sessionManager.validateSession(token);
  if (!sessionStatus.valid) {
    return res.status(401).json({ error: 'Akses ditolak: ' + sessionStatus.reason });
  }

  req.user = sessionStatus;
  req.sessionToken = token;
  next();
}

export const authController = {
  /**
   * Registrasi Akun Baru (Fase 1)
   * User mendaftarkan password (F1), Root Commitment (F2), dan salt2fa.
   * Menolak jika username sudah terdaftar untuk mencegah Account Takeover.
   * Overwrite hanya diizinkan jika mode demo aktif secara eksplisit (DEMO_MODE=true / ALLOW_DEMO_OVERWRITE=true).
   */
  async register(req, res) {
    try {
      const { username, password, rootCommitment, salt2fa, allowOverwrite } = req.body;

      if (!username || !password || !rootCommitment) {
        return res.status(400).json({
          error: 'Parameter tidak lengkap. Diperlukan: username, password, rootCommitment.'
        });
      }

      // Validasi format username, password, dan field element BN254
      const userErr = validateUsername(username);
      if (userErr) return res.status(400).json({ error: userErr });

      const passErr = validatePassword(password);
      if (passErr) return res.status(400).json({ error: passErr });

      const commErr = validateBN254Field(rootCommitment, 'rootCommitment');
      if (commErr) return res.status(400).json({ error: commErr });

      // Cegah Account Takeover: Tolak jika username sudah terdaftar
      const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.ALLOW_DEMO_OVERWRITE === 'true';
      const permitsOverwrite = isDemoMode && allowOverwrite === true;

      if (db.userExists(username) && !permitsOverwrite) {
        return res.status(409).json({
          error: `Username "${username}" sudah terdaftar. Silakan gunakan username lain atau gunakan fitur pemulihan akun jika lupa password.`
        });
      }

      const passwordSalt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, passwordSalt);
      const user = db.saveUser({
        username,
        passwordHash,
        passwordSalt,
        rootCommitment,
        salt2fa: salt2fa || '0'
      });

      return res.status(201).json({
        success: true,
        message: 'Registrasi berhasil. Root Commitment 2FA tersimpan.',
        user: {
          username: user.username,
          rootCommitment: user.rootCommitment,
          createdAt: user.createdAt
        }
      });
    } catch (err) {
      console.error('[Register Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat registrasi.' });
    }
  },

  /**
   * Login Standar (Username & Password)
   * Login harian cepat tanpa perlu upload 3 gambar kunci 2FA
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Diperlukan username dan password.' });
      }

      const user = db.getUser(username);
      if (!user) {
        return res.status(404).json({ error: 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.' });
      }

      const passwordHash = hashPassword(password, user.passwordSalt);
      if (user.passwordHash !== passwordHash) {
        return res.status(401).json({ error: 'Password salah. Gunakan opsi "Lupa Password" jika Anda lupa.' });
      }

      const { token: sessionToken, expiresIn } = sessionManager.createSession(user.username);
      return res.json({
        success: true,
        message: 'Login berhasil!',
        sessionToken,
        expiresIn,
        user: {
          username: user.username,
          authenticatedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('[Login Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat login.' });
    }
  },

  /**
   * Permintaan Tantangan 2FA (Fase 2)
   * Validasi password F1 -> terbitkan sessionNonce (TTL 60 detik)
   */
  async challenge(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Diperlukan username dan password.' });
      }

      const user = db.getUser(username);
      if (!user) {
        return res.status(404).json({ error: 'Akun tidak ditemukan.' });
      }

      const passwordHash = hashPassword(password, user.passwordSalt);
      if (user.passwordHash !== passwordHash) {
        return res.status(401).json({ error: 'Password Faktor 1 tidak valid.' });
      }

      // Terbitkan session nonce berbatas waktu
      const challenge = nonceManager.issueNonce(user.username);

      return res.status(200).json({
        success: true,
        sessionNonce: challenge.sessionNonce,
        expiresIn: challenge.expiresIn,
        expiresAt: challenge.expiresAt,
        rootCommitment: user.rootCommitment,
        salt2fa: user.salt2fa || '0'
      });
    } catch (err) {
      console.error('[Challenge Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat pembuatan challenge.' });
    }
  },

  /**
   * Verifikasi 2FA ZK-Proof & Penerbitan Token Sesi (Fase 3)
   */
  async verify2fa(req, res) {
    try {
      const { username, sessionNonce, sessionAuthToken, proof } = req.body;

      if (!username || !sessionNonce || !sessionAuthToken || !proof) {
        return res.status(400).json({
          error: 'Payload tidak lengkap. Diperlukan: username, sessionNonce, sessionAuthToken, proof.'
        });
      }

      const user = db.getUser(username);
      if (!user) {
        return res.status(404).json({ error: 'Akun tidak ditemukan.' });
      }

      // 1. Validasi status nonce dan hanguskan seketika (Single-Use Anti-Replay)
      const nonceStatus = nonceManager.validateAndBurn(username, sessionNonce);
      if (!nonceStatus.valid) {
        return res.status(401).json({
          error: 'Otentikasi 2FA ditolak: ' + nonceStatus.reason
        });
      }

      // 2. Verifikasi bukti ZK Groth16
      const zkResult = await verifyZkProof(
        sessionAuthToken,
        user.rootCommitment,
        sessionNonce,
        proof
      );

      if (!zkResult.valid) {
        return res.status(401).json({
          error: 'Zero-Knowledge Proof tidak valid atau tidak cocok dengan file kunci / nonce.',
          verificationDurationMs: zkResult.durationMs,
          zkError: zkResult.error
        });
      }

      // 3. Bukti valid -> terbitkan session token
      const { token: sessionToken, expiresIn } = sessionManager.createSession(user.username);

      return res.json({
        success: true,
        message: 'Otentikasi 2FA Berhasil! Akses Vault diberikan.',
        verificationDurationMs: zkResult.durationMs,
        sessionToken,
        expiresIn,
        user: {
          username: user.username,
          authenticatedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('[Verify2FA Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat verifikasi 2FA.' });
    }
  },

  /**
   * Skenario Lupa Password (Fase A): Minta Challenge Pemulihan via 2FA
   */
  async recoverChallenge(req, res) {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username diperlukan.' });
      }

      const user = db.getUser(username);
      if (!user) {
        return res.status(404).json({ error: 'Akun "' + username + '" tidak ditemukan.' });
      }

      const challenge = nonceManager.issueNonce(user.username);

      // Kriptografi Aman: JANGAN bocorkan rootCommitment atau salt2fa ke publik tanpa autentikasi!
      // Mencegah penyerang mendapatkan target commitment untuk serangan kamus offline.
      return res.json({
        success: true,
        sessionNonce: challenge.sessionNonce,
        expiresIn: challenge.expiresIn,
        expiresAt: challenge.expiresAt
      });
    } catch (err) {
      console.error('[RecoverChallenge Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat inisialisasi pemulihan akun.' });
    }
  },

  /**
   * Skenario Lupa Password (Fase B): Verifikasi Bukti 3 Foto Kunci & Reset Password
   */
  async recoverReset(req, res) {
    try {
      const { username, sessionNonce, sessionAuthToken, proof, newPassword } = req.body;

      if (!username || !sessionNonce || !sessionAuthToken || !proof || !newPassword) {
        return res.status(400).json({
          error: 'Parameter tidak lengkap. Diperlukan: username, sessionNonce, sessionAuthToken, proof, newPassword.'
        });
      }

      const passErr = validatePassword(newPassword);
      if (passErr) return res.status(400).json({ error: passErr });

      const user = db.getUser(username);
      if (!user) {
        return res.status(404).json({ error: 'Akun tidak ditemukan.' });
      }

      // Validasi & bakar nonce anti-replay
      const nonceStatus = nonceManager.validateAndBurn(username, sessionNonce);
      if (!nonceStatus.valid) {
        return res.status(401).json({
          error: 'Sesi pemulihan ditolak: ' + nonceStatus.reason
        });
      }

      // Verifikasi bukti ZK terhadap 3 kunci foto
      const zkResult = await verifyZkProof(
        sessionAuthToken,
        user.rootCommitment,
        sessionNonce,
        proof
      );

      if (!zkResult.valid) {
        return res.status(401).json({
          error: 'Bukti ZKP 3 Foto Kunci Ditolak! Foto tidak cocok dengan saat pendaftaran.',
          verificationDurationMs: zkResult.durationMs
        });
      }

      // Bukti ZK terbukti valid! Reset password ke password baru
      const passwordSalt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(newPassword, passwordSalt);

      db.saveUser({
        username: user.username,
        passwordHash,
        passwordSalt,
        rootCommitment: user.rootCommitment,
        salt2fa: user.salt2fa || '0'
      });

      return res.json({
        success: true,
        message: 'Password berhasil dipulihkan & direset menggunakan otentikasi ZK 3 Kunci Foto!'
      });
    } catch (err) {
      console.error('[RecoverReset Error]:', err);
      return res.status(500).json({ error: 'Internal server error saat reset password via 2FA.' });
    }
  },

  /**
   * Status akun untuk demo frontend
   * Hanya mengembalikan status keberadaan akun dan timestamp (TIDAK membocorkan commitment)
   */
  async getUserStatus(req, res) {
    const { username } = req.params;
    const user = db.getUser(username);
    if (!user) {
      return res.status(404).json({ exists: false });
    }
    return res.json({
      exists: true,
      username: user.username,
      createdAt: user.createdAt
    });
  },

  /**
   * Protected Endpoint: Akses Vault Pengguna Terotentikasi
   */
  async getVaultData(req, res) {
    return res.json({
      success: true,
      message: 'Akses Vault berhasil diberikan.',
      user: {
        username: req.user.username,
        sessionCreatedAt: req.user.createdAt
      },
      vault: {
        status: 'SECURE_VAULT_UNLOCKED',
        authenticatedVia: 'Zero-Knowledge Multi-Image Keyfile 2FA',
        unlockedAt: new Date().toISOString()
      }
    });
  },

  /**
   * Logout Sesi: Hanguskan session token aktif
   */
  async logout(req, res) {
    if (req.sessionToken) {
      sessionManager.destroySession(req.sessionToken);
    }
    return res.json({
      success: true,
      message: 'Logout berhasil. Sesi telah dihanguskan dari server.'
    });
  }
};

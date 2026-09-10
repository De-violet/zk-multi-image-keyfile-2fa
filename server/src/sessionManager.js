import crypto from 'crypto';

// Masa berlaku session token (24 jam dalam milidetik)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

class SessionManager {
  constructor() {
    // Map: token (hex string) => { username, createdAt, expiresAt }
    this.sessions = new Map();

    // Pembersihan berkala setiap 5 menit
    const timer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  /**
   * Menerbitkan token sesi baru untuk pengguna terotentikasi
   */
  createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const sessionData = {
      username: username.toLowerCase(),
      createdAt: new Date(now).toISOString(),
      expiresAt: now + SESSION_TTL_MS
    };

    this.sessions.set(token, sessionData);
    return {
      token,
      expiresAt: sessionData.expiresAt,
      expiresIn: Math.floor(SESSION_TTL_MS / 1000)
    };
  }

  /**
   * Validasi token sesi aktif
   */
  validateSession(token) {
    if (!token) {
      return { valid: false, reason: 'Token tidak disediakan.' };
    }

    const session = this.sessions.get(token);
    if (!session) {
      return { valid: false, reason: 'Sesi tidak ditemukan atau telah kedaluwarsa.' };
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return { valid: false, reason: 'Sesi telah kedaluwarsa.' };
    }

    return {
      valid: true,
      username: session.username,
      createdAt: session.createdAt
    };
  }

  /**
   * Hapus / logout sesi aktif
   */
  destroySession(token) {
    if (token && this.sessions.has(token)) {
      this.sessions.delete(token);
      return true;
    }
    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [token, data] of this.sessions.entries()) {
      if (now > data.expiresAt) {
        this.sessions.delete(token);
      }
    }
  }

  clear() {
    this.sessions.clear();
  }
}

export const sessionManager = new SessionManager();

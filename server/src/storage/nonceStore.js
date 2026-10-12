/**
 * Storage Adapter Interface untuk ZK-OTP Nonce Management.
 * Menyediakan implementasi in-memory default dan interface untuk integrasi Redis/Database.
 */

export class MemoryNonceStore {
  constructor() {
    this._store = new Map();
  }

  async get(nonce) {
    const record = this._store.get(nonce);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this._store.delete(nonce);
      return null;
    }
    return record;
  }

  async set(nonce, data, ttlMs = 35000) {
    this._store.set(nonce, {
      ...data,
      expiresAt: Date.now() + ttlMs
    });
  }

  async delete(nonce) {
    this._store.delete(nonce);
  }

  has(nonce) {
    const record = this._store.get(nonce);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      this._store.delete(nonce);
      return false;
    }
    return true;
  }

  clear() {
    this._store.clear();
  }
}

// Instance default in-memory singleton
export const defaultNonceStore = new MemoryNonceStore();

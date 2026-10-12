/**
 * Lightweight Type-Safe Event Emitter dengan fungsi Unsubscribe.
 * Mencegah memory leak dan bebas dependensi luar.
 */

export class SdkEventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * Mendaftarkan listener untuk event tertentu.
   * @param {string} event
   * @param {Function} handler
   * @returns {() => void} Fungsi unsubscribe untuk melepas listener
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler untuk event "${event}" harus berupa fungsi.`);
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const handlers = this.listeners.get(event);
    handlers.add(handler);

    // Return unbind callback
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Menghapus listener tertentu.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Memicu pemanggilan seluruh listener untuk suatu event.
   * @param {string} event
   * @param {any} payload
   */
  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[ZkCanvasSDK EventEmitter Error pada event "${event}"]:`, err);
      }
    }
  }

  /**
   * Membersihkan seluruh listener event.
   */
  removeAllListeners() {
    this.listeners.clear();
  }
}

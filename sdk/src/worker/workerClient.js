/**
 * Background Layer: Client wrapper untuk mengelola lifecycle Web Worker.
 * Mengubah postMessage/onmessage menjadi Promise-based API sederhana.
 */

import { WORKER_ACTION } from './protocol.js';

export class WorkerClient {
  /**
   * @param {object} options
   * @param {string} [options.workerScriptUrl]
   * @param {number} [options.timeoutMs=15000]
   * @param {Worker} [options.customWorker] - Untuk dependency injection / mock testing
   */
  constructor(options = {}) {
    this.workerScriptUrl = options.workerScriptUrl || '/sdk/workerScript.js';
    this.timeoutMs = options.timeoutMs || 15000;
    this.customWorker = options.customWorker || null;

    /** @type {Worker|null} */
    this.worker = null;
    /** @type {Map<string, { resolve: Function, reject: Function, timer: any }>} */
    this.pendingRequests = new Map();
    this.requestCounter = 0;
  }

  /**
   * Menginisialisasi worker jika belum aktif.
   */
  initWorker() {
    if (this.worker) return this.worker;

    if (this.customWorker) {
      this.worker = this.customWorker;
    } else if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(this.workerScriptUrl);
      } catch (e) {
        // Fallback Blob URL jika terkena pembatasan CORS Cross-Origin
        const blob = new Blob([`importScripts("${this.workerScriptUrl}");`], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
      }
    } else {
      throw new Error('Web Worker API tidak tersedia di lingkungan saat ini.');
    }

    this.worker.onmessage = (event) => {
      const { id, ok, payload, error } = event.data || {};
      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);

      if (ok) {
        pending.resolve(payload);
      } else {
        pending.reject(new Error(error || 'Worker menghasilkan kegagalan tanpa pesan error.'));
      }
    };

    this.worker.onerror = (errorEvent) => {
      const errMsg = errorEvent.message || 'Worker runtime error';
      // Tolak semua pending request jika worker crash
      for (const [id, pending] of this.pendingRequests.entries()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Worker crash: ${errMsg}`));
      }
      this.pendingRequests.clear();
    };

    return this.worker;
  }

  /**
   * Menjalankan komputasi proof di worker thread melalui Promise.
   * @param {object} params
   * @param {string|bigint} params.secret
   * @param {number} params.timeWindow
   * @param {string} params.challenge
   * @param {string} params.wasmUrl
   * @param {string} params.zkeyUrl
   * @returns {Promise<any>}
   */
  async generateProof({ secret, timeWindow, challenge, wasmUrl, zkeyUrl }) {
    this.initWorker();

    const id = `req_${++this.requestCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Worker timeout: Proses pembuktian ZK melebihi batas ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.worker.postMessage({
        id,
        type: WORKER_ACTION.GENERATE_PROOF,
        payload: {
          secret: secret.toString(),
          timeWindow: timeWindow.toString(),
          challenge: challenge.toString(),
          wasmUrl,
          zkeyUrl
        }
      });
    });
  }

  /**
   * Menghentikan worker dan membatalkan semua pending promise.
   */
  terminate() {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Worker dihentikan (terminated).'));
    }
    this.pendingRequests.clear();

    if (this.worker && typeof this.worker.terminate === 'function') {
      this.worker.terminate();
    }
    this.worker = null;
  }
}

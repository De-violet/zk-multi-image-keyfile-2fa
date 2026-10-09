/**
 * Public Facade: ZkCanvasSDK
 * Menyembunyikan seluruh kompleksitas internal (Worker, Circom, Groth16, Canvas DPR).
 */

import { calculateTimeWindow, calculateRemainingMs } from '../core/timeWindow.js';
import { generateNumericMatrix } from '../core/matrix.js';
import { CanvasMatrixRenderer } from '../renderer/canvasRenderer.js';
import { WorkerClient } from '../worker/workerClient.js';
import { SnarkjsWorkerAdapter } from '../zk/zkAdapter.js';
import { SdkEventEmitter } from '../events/eventEmitter.js';

export class ZkCanvasSDK {
  /**
   * @param {object} config
   * @param {string|bigint} config.secret - Kunci master rahasia pengguna
   * @param {HTMLCanvasElement} [config.canvas] - Elemen canvas target render (opsional jika headless)
   * @param {number} [config.rotationIntervalMs=60000] - Siklus rotasi jendela waktu
   * @param {string} [config.assetBaseUrl='/zk/'] - Base URL aset statis WASM & ZKey
   * @param {string} [config.wasmUrl] - Override path WASM
   * @param {string} [config.zkeyUrl] - Override path ZKey
   * @param {string} [config.workerScriptUrl] - Override path worker script
   * @param {readonly string[]} [config.customPalette] - 16 palet warna custom
   * @param {number} [config.workerTimeoutMs=15000] - Batas waktu pembuktian ZK
   * @param {Worker} [config.customWorker] - Injected worker instance untuk pengujian
   */
  constructor(config) {
    if (!config || config.secret === undefined || config.secret === null) {
      throw new Error('ZkCanvasSDK: Properti "secret" wajib disediakan pada konfigurasi.');
    }

    this.secret = config.secret;
    this.canvas = config.canvas || null;
    this.intervalMs = Math.max(1000, config.rotationIntervalMs || 45000);
    this.assetBaseUrl = (config.assetBaseUrl || '/zk/').replace(/\/?$/, '/');

    // Asset URLs
    const wasmUrl = config.wasmUrl || `${this.assetBaseUrl}VisualTOTP.wasm`;
    const zkeyUrl = config.zkeyUrl || `${this.assetBaseUrl}VisualTOTP_final.zkey`;
    const workerScriptUrl = config.workerScriptUrl || '/sdk/workerScript.js';

    // 1. Inisialisasi Event Emitter
    this.events = new SdkEventEmitter();

    // 2. Inisialisasi Presentation Layer jika canvas tersedia
    this.renderer = this.canvas
      ? new CanvasMatrixRenderer(this.canvas, { palette: config.customPalette })
      : null;

    // 3. Inisialisasi Background Layer & ZK Prover Adapter
    this.workerClient = new WorkerClient({
      workerScriptUrl,
      timeoutMs: config.workerTimeoutMs || 15000,
      customWorker: config.customWorker
    });

    this.zkAdapter = new SnarkjsWorkerAdapter(this.workerClient, { wasmUrl, zkeyUrl });

    // Internal State
    this.activeWindow = null;
    this.currentMatrix = null;
    this.timerId = null;
    this.active = false;
    this.destroyed = false;
  }

  /**
   * Memulai siklus waktu, pembaruan matriks, dan rendering canvas.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.destroyed) {
      throw new Error('ZkCanvasSDK telah di-destroy dan tidak dapat dijalankan kembali.');
    }
    if (this.active) return;
    this.active = true;

    // Evaluasi pertama seketika
    this.evaluateCycle();

    // Loop interval berbasis kompensasi waktu nyata (anti-throttling drift)
    this.timerId = setInterval(() => {
      this.evaluateCycle();
    }, 1000);
  }

  /**
   * Internal cycle tick & window transition check.
   */
  evaluateCycle() {
    if (!this.active) return;

    const now = Date.now();
    const currentWin = calculateTimeWindow(now, this.intervalMs);
    const remainingMs = calculateRemainingMs(now, this.intervalMs);

    // Deteksi pergantian jendela waktu -> regenerasi matriks
    if (this.activeWindow === null || currentWin !== this.activeWindow) {
      this.activeWindow = currentWin;

      // Seed komputasi matriks deterministik
      const seedCombined = `${this.secret}_win_${currentWin}`;
      this.currentMatrix = generateNumericMatrix(seedCombined);

      // Render ke Presentation Layer jika canvas terpasang
      if (this.renderer) {
        try {
          this.renderer.render(this.currentMatrix);
        } catch (err) {
          this.events.emit('error', {
            code: 'RENDER_ERROR',
            message: 'Gagal merender matriks ke canvas.',
            originalError: err
          });
        }
      }

      this.events.emit('patternChange', {
        window: currentWin,
        matrix: this.currentMatrix
      });
    }

    // Panggil event tick per detik
    this.events.emit('tick', {
      remainingMs,
      currentWindow: currentWin
    });
  }

  /**
   * Menghasilkan Groth16 ZK-Proof secara asinkron di Web Worker.
   * @param {string|Uint8Array} challenge - Challenge nonce dari server
   * @returns {Promise<{ proof: object, publicSignals: string[], durationMs: number }>}
   */
  async generateProof(challenge) {
    if (this.destroyed) {
      throw new Error('ZkCanvasSDK telah di-destroy dan tidak dapat menghasilkan proof.');
    }
    if (!challenge || (typeof challenge === 'string' && challenge.trim() === '')) {
      throw new Error('ZkCanvasSDK: Parameter "challenge" wajib disertakan untuk generateProof.');
    }

    const timeWindow = this.activeWindow !== null
      ? this.activeWindow
      : calculateTimeWindow(Date.now(), this.intervalMs);

    try {
      return await this.zkAdapter.prove({
        secret: this.secret,
        timeWindow,
        challenge
      });
    } catch (err) {
      this.events.emit('error', {
        code: 'PROVER_ERROR',
        message: err.message || 'Gagal menghitung proof ZK di background worker.',
        originalError: err
      });
      throw err;
    }
  }

  /**
   * Mendaftarkan listener event dengan pengembalian fungsi Unsubscribe.
   * @param {'tick'|'patternChange'|'error'} event
   * @param {Function} handler
   * @returns {() => void} Fungsi unsubscribe
   */
  on(event, handler) {
    return this.events.on(event, handler);
  }

  /**
   * Menghentikan interval waktu sementara. Tampilan canvas terakhir dipertahankan.
   */
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.active = false;
  }

  /**
   * Menghancurkan seluruh resource SDK, menghentikan worker, dan membersihkan event.
   */
  destroy() {
    this.stop();
    this.destroyed = true;
    if (this.renderer) {
      this.renderer.clear();
    }
    this.workerClient.terminate();
    this.events.removeAllListeners();
    this.currentMatrix = null;
    this.activeWindow = null;
  }

  /**
   * Memeriksa apakah SDK telah di-destroy.
   * @returns {boolean}
   */
  isDestroyed() {
    return this.destroyed;
  }

  /**
   * Mendapatkan salinan matriks 64 angka saat ini.
   * @returns {number[]|null}
   */
  getMatrix() {
    return this.currentMatrix ? [...this.currentMatrix] : null;
  }

  /**
   * Mendapatkan indeks jendela waktu aktif.
   * @returns {number}
   */
  getCurrentWindow() {
    return this.activeWindow !== null
      ? this.activeWindow
      : calculateTimeWindow(Date.now(), this.intervalMs);
  }

  /**
   * Memeriksa status keaktifan SDK.
   * @returns {boolean}
   */
  isRunning() {
    return this.active;
  }
}

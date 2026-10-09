/**
 * zk-canvas-sdk (Standalone Browser Bundle)
 * Zero-Knowledge Visual TOTP Client-Side SDK
 */
(function (global) {
  'use strict';

  /**
 * Pure Logic: Perhitungan jendela waktu dan rotasi berbasis interval.
 * Bebas dari DOM, Canvas, dan Web Worker.
 */

/**
 * Menghitung indeks jendela waktu aktif berdasarkan timestamp.
 * @param {number} timestampMs - Waktu dalam milidetik (misal Date.now())
 * @param {number} [intervalMs=45000] - Durasi jendela dalam milidetik (default: 45s)
 * @returns {number} Indeks jendela waktu bilangan bulat
 */
function calculateTimeWindow(timestampMs, intervalMs = 45000) {
  if (intervalMs <= 0) {
    throw new Error('intervalMs harus berupa angka positif lebih dari 0.');
  }
  return Math.floor(timestampMs / intervalMs);
}

/**
 * Menghitung sisa milidetik sebelum jendela waktu saat ini berganti.
 * @param {number} timestampMs - Waktu dalam milidetik
 * @param {number} [intervalMs=45000] - Durasi jendela dalam milidetik
 * @returns {number} Sisa waktu dalam milidetik (1 hingga intervalMs)
 */
function calculateRemainingMs(timestampMs, intervalMs = 45000) {
  if (intervalMs <= 0) {
    throw new Error('intervalMs harus berupa angka positif lebih dari 0.');
  }
  const elapsed = timestampMs % intervalMs;
  return intervalMs - elapsed;
}

/**
 * Menghitung timestamp milidetik kapan jendela berikutnya dimulai.
 * @param {number} timestampMs
 * @param {number} [intervalMs=45000]
 * @returns {number}
 */
function calculateNextWindowTimestamp(timestampMs, intervalMs = 45000) {
  const currentWindow = calculateTimeWindow(timestampMs, intervalMs);
  return (currentWindow + 1) * intervalMs;
}

  /**
 * Pure Logic: Dekomposisi data biner menjadi pasangan 2x8-bit (16-bit words).
 * Bebas dari dependensi DOM/Canvas/Worker.
 */

/**
 * Mengonversi berbagai tipe seed menjadi Uint8Array tepat 32-byte (256-bit).
 * @param {string|bigint|number|Uint8Array} input
 * @returns {Uint8Array}
 */
function normalizeToBytes32(input) {
  if (input instanceof Uint8Array) {
    if (input.length === 32) return new Uint8Array(input);
    const buf = new Uint8Array(32);
    buf.set(input.slice(0, 32));
    return buf;
  }

  let hex = '';
  if (typeof input === 'bigint') {
    hex = input.toString(16);
  } else if (typeof input === 'number') {
    hex = BigInt(Math.floor(input)).toString(16);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('0x')) {
      hex = trimmed.slice(2);
    } else if (/^[0-9]+$/.test(trimmed)) {
      hex = BigInt(trimmed).toString(16);
    } else if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length <= 64) {
      hex = trimmed;
    } else {
      // String teks UTF-8 sembarang: hashing sederhana / direct bytes
      const encoder = new TextEncoder();
      const raw = encoder.encode(trimmed);
      const buf = new Uint8Array(32);
      for (let i = 0; i < raw.length; i++) {
        buf[i % 32] ^= raw[i];
      }
      return buf;
    }
  } else {
    hex = '0';
  }

  // Pad ke 64 karakter hexadesimal (32 byte)
  hex = hex.padStart(64, '0').slice(-64);

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Memecah 32 bytes biner menjadi array 16 kata 16-bit (pasangan 2x8-bit, Big-Endian).
 * @param {Uint8Array} bytes32
 * @returns {Uint16Array} Array 16 elemen bertipe 16-bit unsigned integer
 */
function decomposeToWords16(bytes32) {
  if (bytes32.length < 32) {
    throw new Error('Input harus memiliki panjang minimal 32 byte.');
  }

  const words = new Uint16Array(16);
  for (let i = 0; i < 16; i++) {
    const byte0 = bytes32[i * 2];
    const byte1 = bytes32[i * 2 + 1];
    words[i] = (byte0 << 8) | byte1;
  }
  return words;
}

  /**
 * Pure Logic: Pemetaan palet warna 4-bit dan ekstraksi nibble.
 * Bebas dari DOM dan Canvas API.
 */

// 16 Palet Warna Baku (Kontras Tinggi)
const DEFAULT_PALETTE_16 = Object.freeze([
  '#1e1e2e', '#313244', '#45475a', '#585b70',
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1',
  '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa',
  '#b4befe', '#cdd6f4', '#bac2de', '#ffffff'
]);

/**
 * Mengekstrak 4 nilai 4-bit (nibble: 0 hingga 15) dari satu kata 16-bit.
 * @param {number} word16 - Integer 16-bit (0 hingga 65535)
 * @returns {number[]} Array 4 angka bernilai 0..15
 */
function extractNibblesFromWord16(word16) {
  return [
    (word16 >> 12) & 0x0f,
    (word16 >> 8) & 0x0f,
    (word16 >> 4) & 0x0f,
    word16 & 0x0f
  ];
}

/**
 * Memetakan indeks 4-bit ke kode warna hex.
 * @param {number} nibble - Nilai 0..15
 * @param {readonly string[]} [palette=DEFAULT_PALETTE_16]
 * @returns {string} Hex color
 */
function mapNibbleToColor(nibble, palette = DEFAULT_PALETTE_16) {
  const index = Math.abs(nibble) % palette.length;
  return palette[index];
}

  /**
 * Pure Logic: Generator matriks numerik 8x8 (64 sel) berbasis data biner & palet.
 * Bebas dari DOM/Canvas.
 */




/**
 * Menghasilkan array 64 angka (indeks 4-bit, 0..15) untuk matriks 8x8.
 * Mengikuti pipeline:
 * seed/input -> normalize bytes32 -> 16 kata 16-bit -> 64 sel 4-bit.
 *
 * @param {string|bigint|number|Uint8Array} seed
 * @returns {number[]} Array tepat 64 elemen (indeks 0..15)
 */
function generateNumericMatrix(seed) {
  const bytes32 = normalizeToBytes32(seed);
  const words16 = decomposeToWords16(bytes32);
  const matrix = new Array(64);

  let cellIndex = 0;
  for (let i = 0; i < 16; i++) {
    const nibbles = extractNibblesFromWord16(words16[i]);
    matrix[cellIndex++] = nibbles[0];
    matrix[cellIndex++] = nibbles[1];
    matrix[cellIndex++] = nibbles[2];
    matrix[cellIndex++] = nibbles[3];
  }

  return matrix;
}

/**
 * Mengonversi flat array 64 sel menjadi matriks 2D [8][8].
 * @param {number[]} cells - Array 64 angka
 * @returns {number[][]} Matriks 8 baris x 8 kolom
 */
function matrixToGrid2D(cells) {
  if (cells.length !== 64) {
    throw new Error(`Matriks harus memiliki tepat 64 elemen, diterima ${cells.length}.`);
  }
  const grid = [];
  for (let r = 0; r < 8; r++) {
    grid.push(cells.slice(r * 8, (r + 1) * 8));
  }
  return grid;
}

  /**
 * Presentation Layer: Canvas 2D Renderer untuk Matriks 8x8.
 * Bertanggung jawab hanya untuk menggambar hasil olahan Pure Logic ke Canvas.
 * Tidak mengetahui detail Circom, WASM, Groth16, atau timing logic.
 */



class CanvasMatrixRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {readonly string[]} [options.palette=DEFAULT_PALETTE_16]
   * @param {boolean} [options.handleDpr=true] - Menangani scaling retina display
   */
  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('CanvasMatrixRenderer membutuhkan HTMLCanvasElement yang valid.');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.palette = options.palette || DEFAULT_PALETTE_16;
    this.handleDpr = options.handleDpr !== false;

    this.setupResolution();
  }

  /**
   * Menyesuaikan resolusi internal canvas dengan Device Pixel Ratio (Retina Display).
   */
  setupResolution() {
    if (!this.handleDpr || typeof window === 'undefined') return;

    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width || 200;
    const height = rect.height || this.canvas.height || 200;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);

    if (this.ctx && typeof this.ctx.scale === 'function') {
      this.ctx.scale(dpr, dpr);
    }
  }

  /**
   * Menggambar matriks 64 sel (8x8) ke elemen canvas.
   * @param {number[]} matrix - Array 64 angka indeks (0..15)
   */
  render(matrix) {
    if (!matrix || matrix.length !== 64) {
      throw new Error(`Matriks harus memiliki panjang 64, diterima: ${matrix ? matrix.length : 'null'}`);
    }

    const ctx = this.ctx;
    if (!ctx) return;

    const size = 8;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width || 200;
    const cssHeight = rect.height || 200;
    const cellW = cssWidth / size;
    const cellH = cssHeight / size;

    // Bersihkan canvas sebelum frame baru
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cellValue = matrix[r * size + c];
        const color = mapNibbleToColor(cellValue, this.palette);

        ctx.fillStyle = color;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);

        // Garis batas antar sel yang halus
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  }

  /**
   * Membersihkan canvas.
   */
  clear() {
    if (this.ctx) {
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.clearRect(0, 0, rect.width || this.canvas.width, rect.height || this.canvas.height);
    }
  }
}

  /**
 * Protokol komunikasi typed Main Thread <-> Web Worker.
 */

const WORKER_ACTION = Object.freeze({
  GENERATE_PROOF: 'GENERATE_PROOF',
  PROOF_SUCCESS: 'PROOF_SUCCESS',
  PROOF_ERROR: 'PROOF_ERROR',
  PING: 'PING',
  PONG: 'PONG'
});

  /**
 * Background Layer: Client wrapper untuk mengelola lifecycle Web Worker.
 * Mengubah postMessage/onmessage menjadi Promise-based API sederhana.
 */



class WorkerClient {
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

    const target = this.worker || this.customWorker;
    if (target && typeof target.terminate === 'function') {
      target.terminate();
    }
    this.worker = null;
  }
}

  /**
 * ZK Prover Adapter Interface & Default Worker-backed Implementation.
 * Mengisolasi detail Circom/Groth16/SnarkJS dari Facade SDK.
 */

class SnarkjsWorkerAdapter {
  /**
   * @param {import('../worker/workerClient.js').WorkerClient} workerClient
   * @param {object} assetUrls
   * @param {string} assetUrls.wasmUrl
   * @param {string} assetUrls.zkeyUrl
   */
  constructor(workerClient, assetUrls) {
    this.workerClient = workerClient;
    this.assetUrls = assetUrls;
  }

  /**
   * Menghasilkan Groth16 proof melalui worker.
   * @param {object} params
   * @param {string|bigint} params.secret
   * @param {number} params.timeWindow
   * @param {string|Uint8Array} params.challenge
   * @returns {Promise<{ proof: object, publicSignals: string[], durationMs: number }>}
   */
  async prove({ secret, timeWindow, challenge }) {
    const challengeStr = challenge instanceof Uint8Array
      ? '0x' + Array.from(challenge).map(b => b.toString(16).padStart(2, '0')).join('')
      : challenge.toString();

    return this.workerClient.generateProof({
      secret,
      timeWindow,
      challenge: challengeStr,
      wasmUrl: this.assetUrls.wasmUrl,
      zkeyUrl: this.assetUrls.zkeyUrl
    });
  }
}

  /**
 * Lightweight Type-Safe Event Emitter dengan fungsi Unsubscribe.
 * Mencegah memory leak dan bebas dependensi luar.
 */

class SdkEventEmitter {
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

  /**
 * Public Facade: ZkCanvasSDK
 * Menyembunyikan seluruh kompleksitas internal (Worker, Circom, Groth16, Canvas DPR).
 */








class ZkCanvasSDK {
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


  global.ZkCanvasSDK = ZkCanvasSDK;
  global.zkCanvasSdkCore = {
    calculateTimeWindow,
    calculateRemainingMs,
    generateNumericMatrix,
    DEFAULT_PALETTE_16
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Presentation Layer: Canvas 2D Renderer untuk Matriks 8x8.
 * Bertanggung jawab hanya untuk menggambar hasil olahan Pure Logic ke Canvas.
 * Tidak mengetahui detail Circom, WASM, Groth16, atau timing logic.
 */

import { DEFAULT_PALETTE_16, mapNibbleToColor } from '../core/palette.js';

export class CanvasMatrixRenderer {
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

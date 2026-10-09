/**
 * Renderer Canvas 2D untuk Matriks Visual TOTP 8x8.
 * Menggunakan fillRect() murni tanpa manipulasi DOM berlebih.
 */

export class MatrixRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number} [options.intervalSec=60]
   * @param {function(number): void} [options.onWindowChange] - Callback saat berganti jendela waktu
   * @param {function(number): void} [options.onTick] - Callback detik tersisa (countdown)
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.intervalSec = options.intervalSec || 60;
    this.onWindowChange = options.onWindowChange || null;
    this.onTick = options.onTick || null;

    this.timerId = null;
    this.currentWindow = null;
  }

  /**
   * Render matriks 8x8 langsung ke canvas dengan fillRect murni.
   * @param {number[]} cells - Array 64 indeks warna (0..15)
   * @param {string[]} palette - Array 16 warna hex
   */
  drawMatrix(cells, palette) {
    const size = 8;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cellW = w / size;
    const cellH = h / size;

    // Bersihkan canvas sekali di awal frame
    this.ctx.clearRect(0, 0, w, h);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cellVal = cells[r * size + c];
        const color = palette[cellVal % palette.length];

        this.ctx.fillStyle = color;
        this.ctx.fillRect(c * cellW, r * cellH, cellW, cellH);

        // Garis batas antar sel (subtle border)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  }

  /**
   * Memulai timer siklus 60 detik dan pembaruan otomatis saat window berubah.
   */
  startTimer() {
    this.stopTimer();

    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const activeWindow = Math.floor(nowSec / this.intervalSec);
      const remainingSec = this.intervalSec - (nowSec % this.intervalSec);

      if (this.onTick) {
        this.onTick(remainingSec);
      }

      if (this.currentWindow === null || activeWindow !== this.currentWindow) {
        this.currentWindow = activeWindow;
        if (this.onWindowChange) {
          this.onWindowChange(activeWindow);
        }
      }
    };

    tick();
    this.timerId = setInterval(tick, 1000);
  }

  /**
   * Menghentikan timer siklus.
   */
  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

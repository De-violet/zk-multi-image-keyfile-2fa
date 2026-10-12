/**
 * Generator Pola Visual Matriks Deterministik 8x8 untuk Visual TOTP
 * Menggunakan PRNG Mulberry32 dengan seed dari imageCommitment (Poseidon hash).
 */

function createMulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Menghitung time window saat ini (interval 60 detik).
 * @param {number} intervalSec
 * @returns {number}
 */
export function getCurrentTimeWindow(intervalSec = 60) {
  return Math.floor(Date.now() / 1000 / intervalSec);
}

/**
 * Menghitung sisa detik sebelum jendela waktu saat ini berganti.
 * @param {number} intervalSec
 * @returns {number}
 */
export function getRemainingSeconds(intervalSec = 60) {
  return intervalSec - (Math.floor(Date.now() / 1000) % intervalSec);
}

/**
 * Menggambar grid warna matriks 8x8 deterministik di elemen Canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string|bigint} imageCommitment
 */
export function renderVisualMatrix(canvas, imageCommitment) {
  const ctx = canvas.getContext('2d');
  const gridSize = 8;
  const cellSize = canvas.width / gridSize;

  // Turunkan seed 32-bit dari imageCommitment BigInt
  const bigVal = BigInt(imageCommitment.toString());
  const numericSeed = Number(bigVal & 0xffffffffn);
  const rng = createMulberry32(numericSeed);

  // Palet 8 warna kontras untuk diferensiasi visual manusia
  const palette = [
    '#2E3440', '#D08770', '#EBCB8B', '#A3BE8C',
    '#B48EAD', '#88C0D0', '#5E81AC', '#ECEFF4'
  ];

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const colorIndex = Math.floor(rng() * palette.length);
      ctx.fillStyle = palette[colorIndex];
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
}

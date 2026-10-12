/**
 * Visual TOTP Generator berbasis Bit-Packing (2x8-bit) dan Palet Warna (4-bit).
 * Menghasilkan matriks 8x8 deterministik dari seed/commitment kriptografi.
 */

// 16 Palet Warna (indeks 4-bit: 0 - 15)
export const VISUAL_PALETTE_16 = [
  '#1e1e2e', '#313244', '#45475a', '#585b70',
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1',
  '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa',
  '#b4befe', '#cdd6f4', '#bac2de', '#ffffff'
];

/**
 * Normalisasi seed/commitment menjadi Uint8Array 32-byte (256-bit).
 * @param {string|bigint|number} seed
 * @returns {Uint8Array}
 */
export function seedToBytes32(seed) {
  let hex;
  if (typeof seed === 'bigint') {
    hex = seed.toString(16);
  } else if (typeof seed === 'number') {
    hex = BigInt(seed).toString(16);
  } else if (typeof seed === 'string') {
    hex = seed.startsWith('0x') ? seed.slice(2) : seed;
    // Jika format desimal, konversi ke BigInt terlebih dahulu
    if (!/^[0-9a-fA-F]+$/.test(hex) || !seed.startsWith('0x')) {
      try {
        hex = BigInt(seed).toString(16);
      } catch {
        // Fallback jika string teks biasa: gunakan byte buffer
        const encoder = new TextEncoder();
        const raw = encoder.encode(seed);
        const buf = new Uint8Array(32);
        buf.set(raw.slice(0, 32));
        return buf;
      }
    }
  } else {
    hex = '0';
  }

  // Pad ke 64 karakter hex (32 byte)
  hex = hex.padStart(64, '0').slice(-64);

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Menghasilkan representasi matriks 8x8 dari seed/commitment.
 * Mengambil data biner dalam format pasangan 2x8-bit (16-bit)
 * dan mengekstrak indeks warna 4-bit (16 palet warna) per sel.
 *
 * @param {string|bigint|number} seed
 * @param {string[]} [customPalette]
 * @returns {{ cells: number[], palette: string[], grid: number[][] }}
 */
export function generateVisualPattern(seed, customPalette = VISUAL_PALETTE_16) {
  const bytes = seedToBytes32(seed);
  const cells = new Array(64);
  const palette = customPalette;

  // 16 pasang 2x8-bit (16-bit word) = 32 byte = 64 sel 4-bit
  let cellIdx = 0;
  for (let i = 0; i < 32; i += 2) {
    const byte0 = bytes[i];
    const byte1 = bytes[i + 1];

    // Bentuk pasangan 2x8-bit (16-bit word: big-endian)
    const word16 = (byte0 << 8) | byte1;

    // Ekstrak 4 indeks warna 4-bit dari 16-bit word:
    // Nibble 0 (bits 15-12): byte0 high
    // Nibble 1 (bits 11-8):  byte0 low
    // Nibble 2 (bits 7-4):   byte1 high
    // Nibble 3 (bits 3-0):   byte1 low
    cells[cellIdx++] = (word16 >> 12) & 0x0f;
    cells[cellIdx++] = (word16 >> 8) & 0x0f;
    cells[cellIdx++] = (word16 >> 4) & 0x0f;
    cells[cellIdx++] = word16 & 0x0f;
  }

  // Struktur matriks 8x8 2D
  const grid = [];
  for (let r = 0; r < 8; r++) {
    grid.push(cells.slice(r * 8, (r + 1) * 8));
  }

  return {
    cells,
    palette,
    grid
  };
}

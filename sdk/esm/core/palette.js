/**
 * Pure Logic: Pemetaan palet warna 4-bit dan ekstraksi nibble.
 * Bebas dari DOM dan Canvas API.
 */

// 16 Palet Warna Baku (Kontras Tinggi)
export const DEFAULT_PALETTE_16 = Object.freeze([
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
export function extractNibblesFromWord16(word16) {
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
export function mapNibbleToColor(nibble, palette = DEFAULT_PALETTE_16) {
  const index = Math.abs(nibble) % palette.length;
  return palette[index];
}

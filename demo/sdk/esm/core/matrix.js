/**
 * Pure Logic: Generator matriks numerik 8x8 (64 sel) berbasis data biner & palet.
 * Bebas dari DOM/Canvas.
 */

import { normalizeToBytes32, decomposeToWords16 } from './binary.js';
import { extractNibblesFromWord16 } from './palette.js';

/**
 * Menghasilkan array 64 angka (indeks 4-bit, 0..15) untuk matriks 8x8.
 * Mengikuti pipeline:
 * seed/input -> normalize bytes32 -> 16 kata 16-bit -> 64 sel 4-bit.
 *
 * @param {string|bigint|number|Uint8Array} seed
 * @returns {number[]} Array tepat 64 elemen (indeks 0..15)
 */
export function generateNumericMatrix(seed) {
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
export function matrixToGrid2D(cells) {
  if (cells.length !== 64) {
    throw new Error(`Matriks harus memiliki tepat 64 elemen, diterima ${cells.length}.`);
  }
  const grid = [];
  for (let r = 0; r < 8; r++) {
    grid.push(cells.slice(r * 8, (r + 1) * 8));
  }
  return grid;
}

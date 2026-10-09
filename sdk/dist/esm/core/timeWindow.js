/**
 * Pure Logic: Perhitungan jendela waktu dan rotasi berbasis interval.
 * Bebas dari DOM, Canvas, dan Web Worker.
 */

/**
 * Menghitung indeks jendela waktu aktif berdasarkan timestamp.
 * @param {number} timestampMs - Waktu dalam milidetik (misal Date.now())
 * @param {number} [intervalMs=60000] - Durasi jendela dalam milidetik (default: 60s)
 * @returns {number} Indeks jendela waktu bilangan bulat
 */
export function calculateTimeWindow(timestampMs, intervalMs = 60000) {
  if (intervalMs <= 0) {
    throw new Error('intervalMs harus berupa angka positif lebih dari 0.');
  }
  return Math.floor(timestampMs / intervalMs);
}

/**
 * Menghitung sisa milidetik sebelum jendela waktu saat ini berganti.
 * @param {number} timestampMs - Waktu dalam milidetik
 * @param {number} [intervalMs=60000] - Durasi jendela dalam milidetik
 * @returns {number} Sisa waktu dalam milidetik (1 hingga intervalMs)
 */
export function calculateRemainingMs(timestampMs, intervalMs = 60000) {
  if (intervalMs <= 0) {
    throw new Error('intervalMs harus berupa angka positif lebih dari 0.');
  }
  const elapsed = timestampMs % intervalMs;
  return intervalMs - elapsed;
}

/**
 * Menghitung timestamp milidetik kapan jendela berikutnya dimulai.
 * @param {number} timestampMs
 * @param {number} [intervalMs=60000]
 * @returns {number}
 */
export function calculateNextWindowTimestamp(timestampMs, intervalMs = 60000) {
  const currentWindow = calculateTimeWindow(timestampMs, intervalMs);
  return (currentWindow + 1) * intervalMs;
}

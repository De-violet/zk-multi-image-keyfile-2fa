/**
 * Pure Logic: Dekomposisi data biner menjadi pasangan 2x8-bit (16-bit words).
 * Bebas dari dependensi DOM/Canvas/Worker.
 */

/**
 * Mengonversi berbagai tipe seed menjadi Uint8Array tepat 32-byte (256-bit).
 * @param {string|bigint|number|Uint8Array} input
 * @returns {Uint8Array}
 */
export function normalizeToBytes32(input) {
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
      // String teks UTF-8 sembarang: hashing sponge dengan efek avalanche 32-byte penuh
      const encoder = new TextEncoder();
      const raw = encoder.encode(trimmed);
      const buf = new Uint8Array(32);
      let h = 0x811c9dc5;
      for (let i = 0; i < raw.length; i++) {
        h = Math.imul(h ^ raw[i], 0x01000193);
        h = (h << 13) | (h >>> 19);
      }
      for (let i = 0; i < 32; i++) {
        h = Math.imul(h ^ (i * 31 + 7), 0x5bd1e995);
        h ^= h >>> 13;
        h = Math.imul(h, 0x1b873593);
        buf[i] = ((h >>> ((i % 4) * 8)) ^ h) & 0xff;
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
export function decomposeToWords16(bytes32) {
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

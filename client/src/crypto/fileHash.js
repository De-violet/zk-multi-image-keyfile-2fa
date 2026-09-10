/**
 * Modulo pembagi skalar BN254 (alt_bn128 curve order r)
 */
export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Mengubah ArrayBuffer menjadi hex string
 */
export function bufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < byteArray.length; i++) {
    hex += byteArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Membaca raw biner dari File objek dan menghitung SHA-256 deterministik
 * 100% konsisten lintas browser dan OS tanpa terdistorsi GPU/Canvas
 * @param {File|Blob} file
 * @returns {Promise<{ hexDigest: string, fieldElement: string, byteSize: number, sampleEntropy: number }>}
 */
export async function hashFileDeterministic(file) {
  const arrayBuffer = await file.arrayBuffer();
  const byteSize = arrayBuffer.byteLength;

  // Hitung SHA-256 via Web Crypto API native
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hexDigest = bufferToHex(hashBuffer);

  // Reduksi modulo ke BN254 Field Element
  const bigIntVal = BigInt('0x' + hexDigest);
  const fieldElement = (bigIntVal % SNARK_SCALAR_FIELD).toString();

  // Hitung perkiraan Shannon Entropy sederhana dari sampel data (untuk visualizer UI)
  const sampleEntropy = computeShannonEntropy(new Uint8Array(arrayBuffer.slice(0, Math.min(65536, byteSize))));

  return {
    hexDigest,
    fieldElement,
    byteSize,
    sampleEntropy
  };
}

/**
 * Menghitung Shannon Entropy dari buffer byte (skala 0.0 - 8.0 bit/byte)
 */
function computeShannonEntropy(bytes) {
  if (bytes.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (let i = 0; i < bytes.length; i++) {
    freq[bytes[i]]++;
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / bytes.length;
      entropy -= p * Math.log2(p);
    }
  }
  return parseFloat(entropy.toFixed(3));
}

/**
 * Menyortir elemen medan gambar secara deterministik (Order-Independent Keyfile)
 * Memastikan urutan pemilihan foto tidak menggagalkan ZKP
 * @param {string[]} hashes
 * @returns {string[]}
 */
export function sortImageFieldElements(hashes) {
  return [...hashes].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
}

/**
 * Memeriksa apakah terdapat hash gambar yang duplikat
 * Mencegah penurunan entropi kunci foto
 * @param {string[]} hashes
 * @returns {boolean}
 */
export function hasDuplicateHashes(hashes) {
  const set = new Set(hashes);
  return set.size !== hashes.length;
}

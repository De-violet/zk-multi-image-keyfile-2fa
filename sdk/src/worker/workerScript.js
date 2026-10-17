/* global importScripts, snarkjs */

/**
 * Worker thread script untuk kalkulasi ZK Groth16 SnarkJS.
 */

// Muat SnarkJS dengan fallback lokasi adaptif
try {
  importScripts('../../public/vendor/snarkjs.min.js');
} catch {
  try {
    importScripts('/vendor/snarkjs.min.js');
  } catch {
    try {
      importScripts('/public/vendor/snarkjs.min.js');
    } catch {
      try {
        importScripts('../vendor/snarkjs.min.js');
      } catch (e) {
        // Ditangani saat runtime jika SnarkJS sudah tersedia di global
      }
    }
  }
}

const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function toFieldElementString(input) {
  if (input === undefined || input === null) return '0';
  const str = input.toString().trim();
  if (/^[0-9]+$/.test(str)) return (BigInt(str) % SNARK_SCALAR_FIELD).toString();
  if (/^(0x)?[0-9a-fA-F]+$/.test(str)) {
    const hex = str.startsWith('0x') ? str : '0x' + str;
    return (BigInt(hex) % SNARK_SCALAR_FIELD).toString();
  }
  const bytes = new TextEncoder().encode(str);
  const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return (BigInt(hex) % SNARK_SCALAR_FIELD).toString();
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  if (type === 'PING') {
    self.postMessage({ id, type: 'PONG', ok: true });
    return;
  }

  if (type === 'GENERATE_PROOF') {
    const startTime = performance.now();
    const { secret, timeWindow, challenge, wasmUrl, zkeyUrl } = payload;

    try {
      if (typeof snarkjs === 'undefined') {
        throw new Error('Library SnarkJS belum dimuat di Worker thread.');
      }

      const circuitInputs = {
        masterSecret: toFieldElementString(secret),
        timeWindow: timeWindow.toString(),
        serverNonce: toFieldElementString(challenge)
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmUrl,
        zkeyUrl
      );

      const durationMs = Math.round(performance.now() - startTime);

      self.postMessage({
        id,
        type: 'PROOF_SUCCESS',
        ok: true,
        payload: {
          proof,
          publicSignals,
          durationMs
        }
      });
    } catch (err) {
      self.postMessage({
        id,
        type: 'PROOF_ERROR',
        ok: false,
        error: err.message || 'Gagal menghasilkan ZK proof di worker.'
      });
    }
  }
};

/* global importScripts, snarkjs */

/**
 * Worker thread script untuk kalkulasi ZK Groth16 SnarkJS.
 */

// Muat SnarkJS dengan beberapa fallback lokasi
try {
  importScripts('/vendor/snarkjs.min.js');
} catch {
  try {
    importScripts('/public/vendor/snarkjs.min.js');
  } catch {
    // Jalur fallback relatif
    try {
      importScripts('../vendor/snarkjs.min.js');
    } catch (e) {
      // Ditangani saat runtime jika SnarkJS sudah tersedia di global
    }
  }
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
        masterSecret: secret.toString(),
        timeWindow: timeWindow.toString(),
        serverNonce: challenge.toString()
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

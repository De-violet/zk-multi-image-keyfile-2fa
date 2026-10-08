/* global importScripts, snarkjs */

// Memuat library snarkjs di dalam thread background Web Worker
importScripts('/vendor/snarkjs.min.js');

self.onmessage = async (event) => {
  const { action, payload } = event.data;

  if (action === 'GENERATE_PROOF') {
    const { masterSecret, timeWindow, serverNonce, wasmPath, zkeyPath } = payload;
    const startTime = performance.now();

    try {
      const circuitInput = {
        masterSecret: masterSecret.toString(),
        timeWindow: timeWindow.toString(),
        serverNonce: serverNonce.toString()
      };

      // Eksekusi witness calculation dan Groth16 proof generation di background thread
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        wasmPath,
        zkeyPath
      );

      const durationMs = Math.round(performance.now() - startTime);

      self.postMessage({
        success: true,
        data: {
          proof,
          publicSignals, // [imageCommitment, sessionAuthToken, timeWindow, serverNonce]
          durationMs
        }
      });
    } catch (err) {
      self.postMessage({
        success: false,
        error: err.message || 'Gagal menghitung proof ZK di Web Worker.'
      });
    }
  }
};

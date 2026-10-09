/* global importScripts, snarkjs */

function resolveWorkerBasePath() {
  if (typeof self !== 'undefined' && self.location && self.location.pathname) {
    const p = self.location.pathname;
    const idx = p.lastIndexOf('/workers/');
    if (idx !== -1) return p.substring(0, idx);
    const pubIdx = p.lastIndexOf('/public/workers/');
    if (pubIdx !== -1) return p.substring(0, pubIdx);
    const slashIdx = p.lastIndexOf('/');
    if (slashIdx !== -1) return p.substring(0, slashIdx);
  }
  return '';
}

const basePath = resolveWorkerBasePath();
const candidateScripts = [
  basePath ? `${basePath}/vendor/snarkjs.min.js` : null,
  basePath ? `${basePath}/public/vendor/snarkjs.min.js` : null,
  '/vendor/snarkjs.min.js',
  '/public/vendor/snarkjs.min.js',
  '../vendor/snarkjs.min.js'
].filter(Boolean);

for (const scriptUrl of candidateScripts) {
  try {
    importScripts(scriptUrl);
    if (typeof snarkjs !== 'undefined') break;
  } catch {}
}

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

      function resolveAssetUrl(paramPath, defaultRelative) {
        if (paramPath) {
          if (paramPath.startsWith('http://') || paramPath.startsWith('https://')) return paramPath;
          if (typeof self !== 'undefined' && self.location) {
            return new URL(paramPath, self.location.href).href;
          }
          return paramPath;
        }
        const fallback = basePath ? `${basePath}${defaultRelative}` : defaultRelative;
        if (typeof self !== 'undefined' && self.location) {
          return new URL(fallback, self.location.href).href;
        }
        return fallback;
      }

      const finalWasm = resolveAssetUrl(wasmPath, '/zk/VisualTOTP.wasm');
      const finalZkey = resolveAssetUrl(zkeyPath, '/zk/VisualTOTP_final.zkey');

      // Eksekusi witness calculation dan Groth16 proof generation di background thread
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        finalWasm,
        finalZkey
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

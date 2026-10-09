/**
 * Service klien untuk berkomunikasi dengan zkWorker.js.
 */

function getAdaptiveWorkerPath() {
  if (typeof window !== 'undefined' && window.location) {
    const p = window.location.pathname;
    const base = p.endsWith('/') ? p.slice(0, -1) : p.substring(0, p.lastIndexOf('/'));
    return base ? `${base}/workers/zkWorker.js` : '/workers/zkWorker.js';
  }
  return '/workers/zkWorker.js';
}

export function getZkWorker() {
  if (!workerInstance && typeof window !== 'undefined') {
    workerInstance = new Worker(getAdaptiveWorkerPath());
  }
  return workerInstance;
}

/**
 * Menghasilkan Groth16 ZK-Proof secara non-blocking melalui Web Worker.
 * @param {object} params
 * @param {string|bigint} params.masterSecret
 * @param {number} params.timeWindow
 * @param {string} params.serverNonce
 * @param {string} params.wasmPath
 * @param {string} params.zkeyPath
 * @returns {Promise<{ proof: object, publicSignals: string[], durationMs: number }>}
 */
export function generateVisualProof({
  masterSecret,
  timeWindow,
  serverNonce,
  wasmPath = '/zk/VisualTOTP.wasm',
  zkeyPath = '/zk/VisualTOTP_final.zkey',
  worker = null
}) {
  const activeWorker = worker || getZkWorker();

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      activeWorker.removeEventListener('message', handleMessage);
      if (event.data.success) {
        resolve(event.data.data);
      } else {
        reject(new Error(event.data.error));
      }
    };

    activeWorker.addEventListener('message', handleMessage);
    activeWorker.postMessage({
      action: 'GENERATE_PROOF',
      payload: {
        masterSecret,
        timeWindow,
        serverNonce,
        wasmPath,
        zkeyPath
      }
    });
  });
}

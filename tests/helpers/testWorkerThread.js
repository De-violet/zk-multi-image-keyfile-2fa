import { parentPort } from 'node:worker_threads';
import * as snarkjs from 'snarkjs';

parentPort.on('message', async (event) => {
  const { id, type, payload } = event;

  if (type === 'PING') {
    parentPort.postMessage({ id, type: 'PONG', ok: true });
    return;
  }

  if (type === 'GENERATE_PROOF') {
    const startTime = performance.now();
    const { secret, timeWindow, challenge, wasmUrl, zkeyUrl } = payload;

    try {
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

      parentPort.postMessage({
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
      parentPort.postMessage({
        id,
        type: 'PROOF_ERROR',
        ok: false,
        error: err.message || 'Gagal menghitung proof di worker thread.'
      });
    }
  }
});

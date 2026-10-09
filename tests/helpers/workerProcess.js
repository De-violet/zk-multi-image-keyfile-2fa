import * as snarkjs from 'snarkjs';

process.on('message', async (event) => {
  const { id, type, payload } = event || {};

  if (type === 'PING') {
    process.send({ id, type: 'PONG', ok: true });
    return;
  }

  if (type === 'GENERATE_PROOF') {
    const startTime = performance.now();
    const { secret, timeWindow, challenge, wasmUrl, zkeyUrl } = payload || {};

    if (challenge === 'trigger_worker_error') {
      process.send({
        id,
        type: 'PROOF_ERROR',
        ok: false,
        error: 'Simulated worker cryptographic failure'
      });
      return;
    }

    if (challenge === 'trigger_worker_timeout') {
      // Tidak merespons agar memicu timeout di WorkerClient
      return;
    }

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

      process.send({
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
      process.send({
        id,
        type: 'PROOF_ERROR',
        ok: false,
        error: err.message || 'Worker Groth16 failure'
      });
    }
  }
});

process.on('disconnect', () => {
  process.exit(0);
});

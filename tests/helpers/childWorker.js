
  import * as snarkjs from 'snarkjs';

  process.on('message', async (event) => {
    const { id, type, payload } = event;
    if (type === 'GENERATE_PROOF') {
      try {
        const { secret, timeWindow, challenge, wasmUrl, zkeyUrl } = payload;
        const startTime = performance.now();
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          { masterSecret: secret.toString(), timeWindow: timeWindow.toString(), serverNonce: challenge.toString() },
          wasmUrl,
          zkeyUrl
        );
        const durationMs = Math.round(performance.now() - startTime);
        process.send({ id, ok: true, payload: { proof, publicSignals, durationMs } });
      } catch (err) {
        process.send({ id, ok: false, error: err.message });
      }
    }
  });

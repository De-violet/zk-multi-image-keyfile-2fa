/**
 * ZK Prover Adapter Interface & Default Worker-backed Implementation.
 * Mengisolasi detail Circom/Groth16/SnarkJS dari Facade SDK.
 */

export class SnarkjsWorkerAdapter {
  /**
   * @param {import('../worker/workerClient.js').WorkerClient} workerClient
   * @param {object} assetUrls
   * @param {string} assetUrls.wasmUrl
   * @param {string} assetUrls.zkeyUrl
   */
  constructor(workerClient, assetUrls) {
    this.workerClient = workerClient;
    this.assetUrls = assetUrls;
  }

  /**
   * Menghasilkan Groth16 proof melalui worker.
   * @param {object} params
   * @param {string|bigint} params.secret
   * @param {number} params.timeWindow
   * @param {string|Uint8Array} params.challenge
   * @returns {Promise<{ proof: object, publicSignals: string[], durationMs: number }>}
   */
  async prove({ secret, timeWindow, challenge }) {
    const challengeStr = challenge instanceof Uint8Array
      ? '0x' + Array.from(challenge).map(b => b.toString(16).padStart(2, '0')).join('')
      : challenge.toString();

    return this.workerClient.generateProof({
      secret,
      timeWindow,
      challenge: challengeStr,
      wasmUrl: this.assetUrls.wasmUrl,
      zkeyUrl: this.assetUrls.zkeyUrl
    });
  }
}

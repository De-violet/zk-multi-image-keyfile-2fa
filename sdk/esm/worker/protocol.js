/**
 * Protokol komunikasi typed Main Thread <-> Web Worker.
 */

export const WORKER_ACTION = Object.freeze({
  GENERATE_PROOF: 'GENERATE_PROOF',
  PROOF_SUCCESS: 'PROOF_SUCCESS',
  PROOF_ERROR: 'PROOF_ERROR',
  PING: 'PING',
  PONG: 'PONG'
});

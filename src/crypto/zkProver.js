/**
 * Groth16 Prover di sisi klien (Browser)
 * Memanfaatkan WebAssembly dan SnarkJS untuk menghasilkan bukti dalam waktu < 1 detik
 */

let snarkjsInstance = null;

async function getSnarkJS() {
  if (!snarkjsInstance) {
    if (typeof window !== 'undefined' && window.snarkjs) {
      snarkjsInstance = window.snarkjs;
    } else {
      const snark = await import('/vendor/snarkjs/build/snarkjs.min.js').catch(async () => {
        return await import('snarkjs');
      });
      snarkjsInstance = snark.default || snark;
    }
  }
  return snarkjsInstance;
}

/**
 * Menghasilkan Groth16 ZK-Proof lokal
 * @param {object} params
 * @param {string} params.h1 - Field element hash gambar 1
 * @param {string} params.h2 - Field element hash gambar 2
 * @param {string} params.h3 - Field element hash gambar 3
 * @param {string} params.salt - Field element Secret Salt
 * @param {string} params.rootCommitment - Root commitment publik terdaftar
 * @param {string} params.sessionNonce - Nonce publik aktif dari server
 * @param {string} [params.wasmPath] - URL/path ke MultiImageKeyfile2FA.wasm
 * @param {string} [params.zkeyPath] - URL/path ke circuit_final.zkey
 */
export async function generateZkProof({
  h1,
  h2,
  h3,
  salt,
  rootCommitment,
  sessionNonce,
  wasmPath = '/zk/MultiImageKeyfile2FA_js/MultiImageKeyfile2FA.wasm',
  zkeyPath = '/zk/circuit_final.zkey'
}) {
  const snarkjs = await getSnarkJS();
  const startTime = performance.now();

  const circuitInputs = {
    h1: h1.toString(),
    h2: h2.toString(),
    h3: h3.toString(),
    salt: salt.toString(),
    rootCommitment: rootCommitment.toString(),
    sessionNonce: sessionNonce.toString()
  };

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));

    // publicSignals[0] adalah output sessionAuthToken
    // publicSignals[1] adalah rootCommitment
    // publicSignals[2] adalah sessionNonce
    const sessionAuthToken = publicSignals[0];

    return {
      success: true,
      proof,
      publicSignals,
      sessionAuthToken,
      durationMs
    };
  } catch (err) {
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));
    return {
      success: false,
      error: err.message,
      durationMs
    };
  }
}

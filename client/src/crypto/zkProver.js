/**
 * Groth16 Prover di sisi klien (Browser)
 * Memanfaatkan WebAssembly dan SnarkJS untuk menghasilkan bukti dalam waktu < 1 detik
 * Mendukung otomatisasi path untuk Localhost dan GitHub Pages
 */

let snarkjsInstance = null;

async function getSnarkJS() {
  if (!snarkjsInstance) {
    if (typeof window !== 'undefined' && window.snarkjs) {
      snarkjsInstance = window.snarkjs;
    } else {
      const snark = await import('../public/vendor/snarkjs.min.js').catch(async () => {
        return await import('snarkjs');
      });
      snarkjsInstance = snark.default || snark;
    }
  }
  return snarkjsInstance;
}

// Resolver path artefak sirkuit dinamis (Localhost vs GitHub Pages)
export async function resolveArtifactPath(filename) {
  const defaultPath = './public/zk/' + filename;
  try {
    const res = await fetch(defaultPath, { method: 'HEAD' });
    if (res.ok) return defaultPath;
  } catch (e) {}

  const fallbacks = [
    '/public/zk/' + filename,
    '/zk/' + filename,
    '/zk/MultiImageKeyfile2FA_js/' + filename
  ];
  for (const p of fallbacks) {
    try {
      const res = await fetch(p, { method: 'HEAD' });
      if (res.ok) return p;
    } catch (e) {}
  }
  return defaultPath;
}

/**
 * Menghasilkan Groth16 ZK-Proof lokal
 */
export async function generateZkProof({
  h1,
  h2,
  h3,
  salt,
  rootCommitment,
  sessionNonce,
  wasmPath,
  zkeyPath
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

  const finalWasm = wasmPath || (await resolveArtifactPath('MultiImageKeyfile2FA.wasm'));
  const finalZkey = zkeyPath || (await resolveArtifactPath('circuit_final.zkey'));

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      finalWasm,
      finalZkey
    );

    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      proof,
      publicSignals,
      sessionAuthToken: publicSignals[0],
      durationMs
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      error: err.message,
      durationMs
    };
  }
}

/**
 * Memverifikasi Groth16 ZK-Proof secara lokal di browser
 */
export async function verifyZkProof(vKey, publicSignals, proof) {
  const snarkjs = await getSnarkJS();
  return await snarkjs.groth16.verify(vKey, publicSignals, proof);
}

export { getSnarkJS };


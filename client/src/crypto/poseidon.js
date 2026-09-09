// Menggunakan circomlibjs buildPoseidon
// Di browser, circomlibjs dapat dimuat via window.circomlibjs atau ESM import

let poseidonInstance = null;

export async function getPoseidon() {
  if (!poseidonInstance) {
    if (typeof window !== 'undefined' && window.circomlibPoseidon && window.circomlibPoseidon.buildPoseidon) {
      poseidonInstance = await window.circomlibPoseidon.buildPoseidon();
    } else if (typeof window !== 'undefined' && window.circomlibjs && window.circomlibjs.buildPoseidon) {
      poseidonInstance = await window.circomlibjs.buildPoseidon();
    } else {
      const circomlibjs = await import('circomlibjs');
      poseidonInstance = await circomlibjs.buildPoseidon();
    }
  }
  return poseidonInstance;
}

/**
 * Hash hierarkis Poseidon:
 * 1. masterKey = Poseidon([h1, h2, h3])
 * 2. rootCommitment = Poseidon([masterKey, salt])
 */
export async function computeHierarchicalCommitment(h1, h2, h3, salt) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  // 1. Poseidon(3) untuk 3 hash gambar
  const masterKeyHash = poseidon([h1, h2, h3]);
  const masterKeyStr = F.toString(masterKeyHash);

  // 2. Poseidon(2) untuk master key + salt
  const rootCommitmentHash = poseidon([masterKeyHash, salt]);
  const rootCommitmentStr = F.toString(rootCommitmentHash);

  return {
    masterKey: masterKeyStr,
    rootCommitment: rootCommitmentStr
  };
}

/**
 * Menghitung token otentikasi sesi terikat:
 * sessionAuthToken = Poseidon([masterKey, sessionNonce])
 */
export async function computeSessionAuthToken(masterKey, sessionNonce) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const tokenHash = poseidon([masterKey, sessionNonce]);
  return F.toString(tokenHash);
}

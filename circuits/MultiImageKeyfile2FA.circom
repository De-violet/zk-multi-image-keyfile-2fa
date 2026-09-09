pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

/*
  MultiImageKeyfile2FA:
  Sirkuit Zero-Knowledge Proof untuk otentikasi faktor kedua berbasis 3 file gambar kunci statis.
  
  Domain Privat:
    - h1, h2, h3: 256-bit Field Element hasil reduksi SHA-256 dari file gambar mentah.
    - salt: 256-bit Secret Salt milik pengguna (CSPRNG / PBKDF2).

  Domain Publik:
    - rootCommitment: Hash Poseidon permanen yang terdaftar di server.
    - sessionNonce: Nonce sesi berbatas waktu (TTL <= 60s) dari server.
    
  Output Publik:
    - sessionAuthToken: Token otentikasi sesi yang terikat matematis dengan master key dan sessionNonce.
*/
template MultiImageKeyfile2FA() {
    // === Private Inputs (Domain Rahasia Klien) ===
    signal input h1;
    signal input h2;
    signal input h3;
    signal input salt;

    // === Public Inputs (Domain Publik Terverifikasi Server) ===
    signal input rootCommitment;
    signal input sessionNonce;

    // === Public Output (Sinyal Publik Hasil Komputasi Sirkuit) ===
    signal output sessionAuthToken;

    // 1. Ekstraksi Kunci Induk (Master Key) dari 3 Hash Gambar
    component masterHasher = Poseidon(3);
    masterHasher.inputs[0] <== h1;
    masterHasher.inputs[1] <== h2;
    masterHasher.inputs[2] <== h3;

    // 2. Validasi Kesesuaian Kunci Induk + Salt terhadap Root Commitment
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== masterHasher.out;
    commitmentHasher.inputs[1] <== salt;
    commitmentHasher.out === rootCommitment;

    // 3. Ikatan Matematis Nonce Sesi (Anti-Replay & Proof Coupling)
    // Proof must be mathematically locked to this exact sessionNonce using master secret
    component sessionHasher = Poseidon(2);
    sessionHasher.inputs[0] <== masterHasher.out;
    sessionHasher.inputs[1] <== sessionNonce;
    sessionAuthToken <== sessionHasher.out;
}

component main {public [rootCommitment, sessionNonce]} = MultiImageKeyfile2FA();

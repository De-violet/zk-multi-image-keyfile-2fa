pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

/*
  VisualTOTP:
  Sirkuit Zero-Knowledge Proof untuk 2FA Visual berbasis TOTP dinamis.

  Input Privat:
    - masterSecret: Rahasia pengguna (private key/field element).

  Input Publik:
    - timeWindow: Jendela waktu aktif 60 detik (Math.floor(timestamp / 60)).
    - serverNonce: Nonce sesi satu kali pakai dari server.

  Output Publik:
    - imageCommitment: Hash Poseidon aktif sebagai seed visual pattern.
    - sessionAuthToken: Token otentikasi sesi yang mengikat komitmen dengan serverNonce.
*/
template VisualTOTP() {
    // === Private Input ===
    signal input masterSecret;

    // === Public Inputs ===
    signal input timeWindow;
    signal input serverNonce;

    // === Public Outputs ===
    signal output imageCommitment;
    signal output sessionAuthToken;

    // 1. Hitung komitmen gambar aktif berbasis waktu
    component imgHasher = Poseidon(2);
    imgHasher.inputs[0] <== masterSecret;
    imgHasher.inputs[1] <== timeWindow;
    imageCommitment <== imgHasher.out;

    // 2. Ikat serverNonce secara matematis untuk mencegah replay attack
    component sessionHasher = Poseidon(2);
    sessionHasher.inputs[0] <== imgHasher.out;
    sessionHasher.inputs[1] <== serverNonce;
    sessionAuthToken <== sessionHasher.out;
}

component main {public [timeWindow, serverNonce]} = VisualTOTP();

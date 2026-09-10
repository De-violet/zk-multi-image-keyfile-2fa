#!/usr/bin/env bash
set -e

# Pindah ke direktori root proyek
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "========================================================="
echo "   Kompilasi Sirkuit Zero-Knowledge Multi-Image 2FA"
echo "========================================================="

# Buat direktori build dan contracts jika belum ada
mkdir -p circuits/build
mkdir -p contracts
mkdir -p client/public/zk

CIRCUIT_NAME="MultiImageKeyfile2FA"

echo "1. Mengompilasi sirkuit Circom..."
circom "circuits/${CIRCUIT_NAME}.circom" \
  -l node_modules \
  --r1cs \
  --wasm \
  --sym \
  -o circuits/build

echo "Sirkuit berhasil dikompilasi ke R1CS dan WASM."

# ==============================================================================
# KEAMANAN TRUSTED SETUP (GROTH16 TOXIC WASTE CAVEAT)
# ==============================================================================
# PENTING: Jangan pernah melakukan hardcode nilai entropi (-e="...") di script publik!
# Jika entropi (toxic waste / trapdoor) diketahui oleh pihak ketiga, penyerang dapat
# memalsukan bukti ZK untuk komitmen akar (rootCommitment) akun korban tanpa memiliki foto.
#
# Untuk produksi: Gunakan file PTAU dari upacara publik universal (Hermez/PSE/Perpetual Powers of Tau).
# Untuk pengujian lokal: Hilangkan flag -e agar snarkjs meminta entropi acak dinamis dari input pengguna,
# atau gunakan CSPRNG sistem (/dev/urandom) saat berjalan di lingkungan non-interaktif (CI/CD).
# ==============================================================================

PTAU_FINAL="circuits/build/pot12_final.ptau"

# Periksa apakah pengguna menyediakan file PTAU upacara publik (Hermez/PSE)
if [ -n "$PUBLIC_PTAU_PATH" ] && [ -f "$PUBLIC_PTAU_PATH" ]; then
  echo "-> Menggunakan file Powers of Tau upacara publik: $PUBLIC_PTAU_PATH"
  PTAU_FINAL="$PUBLIC_PTAU_PATH"
elif [ -f "circuits/build/powersOfTau28_hez_final_12.ptau" ]; then
  echo "-> Ditemukan file Powers of Tau upacara Hermez/PSE lokal."
  PTAU_FINAL="circuits/build/powersOfTau28_hez_final_12.ptau"
else
  echo "2. Menyiapkan Powers of Tau Fase 1 (Groth16 BN128)..."
  npx snarkjs powersoftau new bn128 12 circuits/build/pot12_0000.ptau -v

  echo "-> Melakukan kontribusi Powers of Tau Fase 1..."
  if [ -t 0 ]; then
    # Terminal interaktif: snarkjs akan meminta pengguna mengetik entropi acak secara rahasia
    echo "-> Masukkan teks entropi acak saat diminta snarkjs (jangan dibagikan):"
    npx snarkjs powersoftau contribute circuits/build/pot12_0000.ptau circuits/build/pot12_0001.ptau \
      --name="ZK2FA MultiImage Contributor" -v
  else
    # Non-interaktif: gunakan CSPRNG sistem operasi (/dev/urandom), jangan plaintext hardcoded
    EPHEMERAL_ENTROPY=$(head -c 64 /dev/urandom | base64 | tr -d '\n')
    npx snarkjs powersoftau contribute circuits/build/pot12_0000.ptau circuits/build/pot12_0001.ptau \
      --name="ZK2FA MultiImage Contributor" -v -e="$EPHEMERAL_ENTROPY"
    unset EPHEMERAL_ENTROPY
  fi

  npx snarkjs powersoftau prepare phase2 circuits/build/pot12_0001.ptau "$PTAU_FINAL" -v
fi

echo "3. Menjalankan Groth16 Setup Fase 2 (Circuit-Specific)..."
npx snarkjs groth16 setup "circuits/build/${CIRCUIT_NAME}.r1cs" "$PTAU_FINAL" circuits/build/circuit_0000.zkey

echo "-> Melakukan kontribusi Fase 2 untuk menghasilkan proving key akhir..."
if [ -t 0 ]; then
  # Terminal interaktif: snarkjs meminta entropi acak rahasia dari keyboard pengguna
  echo "-> Masukkan teks entropi acak Fase 2 saat diminta snarkjs:"
  npx snarkjs zkey contribute circuits/build/circuit_0000.zkey circuits/build/circuit_final.zkey \
    --name="MultiImage Phase2 Contributor" -v
else
  # Non-interaktif: gunakan CSPRNG sistem operasi (/dev/urandom)
  EPHEMERAL_ENTROPY=$(head -c 64 /dev/urandom | base64 | tr -d '\n')
  npx snarkjs zkey contribute circuits/build/circuit_0000.zkey circuits/build/circuit_final.zkey \
    --name="MultiImage Phase2 Contributor" -v -e="$EPHEMERAL_ENTROPY"
  unset EPHEMERAL_ENTROPY
fi

echo "4. Mengekspor Verification Key & Solidity Verifier..."
npx snarkjs zkey export verificationkey circuits/build/circuit_final.zkey circuits/build/verification_key.json
npx snarkjs zkey export solidityverifier circuits/build/circuit_final.zkey contracts/MultiImageVerifier.sol

echo "5. Menyalin artefak ZK ke direktori client dan server..."
# Salin WASM dan ZKey ke client/public/zk agar browser dapat memuatnya
cp "circuits/build/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" client/public/zk/
cp circuits/build/circuit_final.zkey client/public/zk/
cp circuits/build/verification_key.json client/public/zk/

# Bersihkan file sementara yang besar
rm -f circuits/build/pot12_0000.ptau circuits/build/pot12_0001.ptau circuits/build/pot12_final.ptau circuits/build/circuit_0000.zkey

echo "========================================================="
echo "   Kompilasi Selesai! Artefak siap digunakan:"
echo "   - WASM: circuits/build/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "   - Proving Key: circuits/build/circuit_final.zkey"
echo "   - Verifier Key: circuits/build/verification_key.json"
echo "   - Smart Contract: contracts/MultiImageVerifier.sol"
echo "========================================================="

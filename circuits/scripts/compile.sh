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

echo "2. Menyiapkan Powers of Tau (Groth16 BN128)..."
# Menggunakan ukuran 2^12 (4096 constraints), sangat cukup untuk ~500 constraints Poseidon
npx snarkjs powersoftau new bn128 12 circuits/build/pot12_0000.ptau -v
npx snarkjs powersoftau contribute circuits/build/pot12_0000.ptau circuits/build/pot12_0001.ptau \
  --name="ZK2FA MultiImage" -v -e="ZKMultiImageEntropyKeyfile2026"
npx snarkjs powersoftau prepare phase2 circuits/build/pot12_0001.ptau circuits/build/pot12_final.ptau -v

echo "3. Menjalankan Groth16 Setup..."
npx snarkjs groth16 setup "circuits/build/${CIRCUIT_NAME}.r1cs" circuits/build/pot12_final.ptau circuits/build/circuit_0000.zkey
npx snarkjs zkey contribute circuits/build/circuit_0000.zkey circuits/build/circuit_final.zkey \
  --name="MultiImage Phase2 Contributor" -v -e="Phase2EntropyContributionFor2FA"

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

#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$ROOT_DIR/circuits/build"
mkdir -p "$BUILD_DIR"

TARGET_FILE="$BUILD_DIR/powersOfTau28_hez_final_12.ptau"

if [ -f "$TARGET_FILE" ] && [ -s "$TARGET_FILE" ]; then
  echo "File Powers of Tau sudah ada di: $TARGET_FILE ($(du -h "$TARGET_FILE" | cut -f1))"
  exit 0
fi

echo "Mengunduh Powers of Tau (Hermez BN128 2^12) untuk SnarkJS..."

PRIMARY_URL="https://circom.info/powersOfTau28_hez_final_12.ptau"
BACKUP_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau"

if command -v curl >/dev/null 2>&1; then
  curl -L --fail --progress-bar "$PRIMARY_URL" -o "$TARGET_FILE" || \
  curl -L --fail --progress-bar "$BACKUP_URL" -o "$TARGET_FILE"
elif command -v wget >/dev/null 2>&1; then
  wget --show-progress -O "$TARGET_FILE" "$PRIMARY_URL" || \
  wget --show-progress -O "$TARGET_FILE" "$BACKUP_URL"
else
  echo "Error: curl atau wget tidak ditemukan di sistem." >&2
  exit 1
fi

echo "Powers of Tau berhasil diunduh ke: $TARGET_FILE"

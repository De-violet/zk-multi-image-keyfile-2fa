#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT_ZK="$ROOT_DIR/client/public/zk"
BUILD_ZK="$ROOT_DIR/circuits/build"

mkdir -p "$CLIENT_ZK"
mkdir -p "$BUILD_ZK"

RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/De-violet/zk-multi-image-keyfile-2fa/releases/latest/download}"

download_or_copy() {
  local filename="$1"
  local target="$CLIENT_ZK/$filename"
  local build_target="$BUILD_ZK/$filename"

  if [ -f "$target" ] && [ -s "$target" ]; then
    echo "Artefak sudah tersedia: $target ($(du -h "$target" | cut -f1))"
    return 0
  fi

  if [ -f "$build_target" ] && [ -s "$build_target" ]; then
    echo "Menyalin dari build lokal: $build_target -> $target"
    cp "$build_target" "$target"
    return 0
  fi

  echo "Mengunduh $filename dari $RELEASE_BASE_URL/$filename..."
  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --progress-bar "$RELEASE_BASE_URL/$filename" -o "$target" || {
      echo "Peringatan: Gagal mengunduh $filename dari release. Pastikan berkas dikompilasi via 'npm run compile:circuit'." >&2
      return 1
    }
  elif command -v wget >/dev/null 2>&1; then
    wget --show-progress -O "$target" "$RELEASE_BASE_URL/$filename" || {
      echo "Peringatan: Gagal mengunduh $filename dari release." >&2
      return 1
    }
  else
    echo "Error: curl atau wget tidak ditemukan." >&2
    return 1
  fi

  cp "$target" "$build_target"
  echo "Berhasil menyiapkan: $target"
}

download_or_copy "VisualTOTP_final.zkey"
download_or_copy "VisualTOTP.wasm"
download_or_copy "VisualTOTP_vkey.json"

echo "Semua artefak ZK siap digunakan."

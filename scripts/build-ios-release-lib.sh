#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$(dirname "$DIR")"

cd "$ROOT_DIR"
node scripts/sync-version.js

# Ensure llvm-tools is installed (provides llvm-objcopy needed to globalize Swift symbols on Xcode 16+)
HOST_TARGET=$(rustc -vV | awk '/host:/ {print $2}')
SYSROOT=$(rustc --print sysroot)
OBJCOPY="$SYSROOT/lib/rustlib/$HOST_TARGET/bin/llvm-objcopy"

if [ ! -f "$OBJCOPY" ]; then
  echo "==> Installing llvm-tools for symbol globalization..."
  rustup component add llvm-tools
fi

echo "==> Building Rust release library for aarch64-apple-ios..."
cargo rustc \
  --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-ios \
  --release \
  --lib \
  --crate-type staticlib

echo "==> Locating Swift runtime library libTauri.a..."
LIB_TAURI=$(find src-tauri/target/aarch64-apple-ios/release/build -path "*/out/swift-rs/Tauri/*/libTauri.a" | head -n 1)

if [ -n "$LIB_TAURI" ] && [ -f "$LIB_TAURI" ]; then
  echo "Found Swift library: $LIB_TAURI"
  # Globalize Swift @_cdecl symbols that SwiftPM internalized on Xcode 16+
  "$OBJCOPY" \
    --globalize-symbol=_log_stdout \
    --globalize-symbol=_on_webview_created \
    --globalize-symbol=_run_plugin_command \
    --globalize-symbol=_release_object \
    --globalize-symbol=_retain_object \
    --globalize-symbol=_string_from_bytes \
    "$LIB_TAURI"
else
  echo "Error: libTauri.a not found in target build directory!"
  exit 1
fi

echo "==> Merging static library with Swift objects using libtool..."
mkdir -p src-tauri/gen/apple/Externals/arm64/release

libtool -static -o src-tauri/gen/apple/Externals/arm64/release/libapp.a \
  src-tauri/target/aarch64-apple-ios/release/libapp_lib.a \
  "$LIB_TAURI"

echo "==> Validating critical symbols in libapp.a..."
NM="$SYSROOT/lib/rustlib/$HOST_TARGET/bin/llvm-nm"
[ ! -f "$NM" ] && NM="nm"

MISSING=0
for SYM in _log_stdout _on_webview_created _run_plugin_command _release_object _retain_object _string_from_bytes; do
  if ! "$NM" src-tauri/gen/apple/Externals/arm64/release/libapp.a | grep -q " [Tt] $SYM"; then
    echo "  [ERROR] Missing required symbol: $SYM"
    MISSING=1
  fi
done

if [ $MISSING -eq 1 ]; then
  echo "==> Symbol validation failed!"
  exit 1
fi

echo "==> All critical symbols verified successfully!"
echo "==> Successfully created src-tauri/gen/apple/Externals/arm64/release/libapp.a!"


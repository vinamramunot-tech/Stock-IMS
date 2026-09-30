#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$(dirname "$DIR")"

cd "$ROOT_DIR"
node scripts/sync-version.js

echo "==> Building Rust release library for aarch64-apple-ios..."
cargo rustc \
  --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-ios \
  --features custom-protocol \
  --release \
  --lib \
  --crate-type staticlib

echo "==> Locating Swift runtime library libTauri.a..."
LIB_TAURI=$(find src-tauri/target/aarch64-apple-ios/release/build -path "*/out/swift-rs/Tauri/*/libTauri.a" | head -n 1)

if [ -z "$LIB_TAURI" ] || [ ! -f "$LIB_TAURI" ]; then
  echo "Error: libTauri.a not found in target build directory!"
  exit 1
fi

echo "Found Swift library: $LIB_TAURI"

# Extract Swift object files and clear N_PEXT (private external) in Mach-O headers
# so the Apple linker treats Swift @_cdecl functions as true global external symbols
SWIFT_TMP=$(mktemp -d)
echo "==> Extracting Swift object files to $SWIFT_TMP..."
(cd "$SWIFT_TMP" && ar x "$ROOT_DIR/$LIB_TAURI")

echo "==> Globalizing Mach-O symbols in Swift objects..."
python3 "$ROOT_DIR/scripts/globalize-macho.py" "$SWIFT_TMP"/*.o

echo "==> Merging static library with globalized Swift objects using libtool..."
mkdir -p src-tauri/gen/apple/Externals/arm64/release

libtool -static -o src-tauri/gen/apple/Externals/arm64/release/libapp.a \
  src-tauri/target/aarch64-apple-ios/release/libapp_lib.a \
  "$SWIFT_TMP"/*.o

rm -rf "$SWIFT_TMP"

echo "==> Validating critical GLOBAL symbols in libapp.a..."
HOST_TARGET=$(rustc -vV | awk '/host:/ {print $2}')
SYSROOT=$(rustc --print sysroot)
NM="$SYSROOT/lib/rustlib/$HOST_TARGET/bin/llvm-nm"
[ ! -f "$NM" ] && NM="nm"

MISSING=0
for SYM in _log_stdout _on_webview_created _run_plugin_command _release_object _retain_object _string_from_bytes; do
  # Strictly check for uppercase T (global defined in text section)
  if ! "$NM" -g src-tauri/gen/apple/Externals/arm64/release/libapp.a 2>/dev/null | grep -q " T $SYM"; then
    echo "  [ERROR] Missing required GLOBAL symbol: $SYM"
    MISSING=1
  else
    echo "  [OK] Verified global symbol: $SYM"
  fi
done

if [ $MISSING -eq 1 ]; then
  echo "==> Symbol validation failed!"
  exit 1
fi

echo "==> All critical symbols verified successfully as GLOBAL!"
echo "==> Successfully created src-tauri/gen/apple/Externals/arm64/release/libapp.a!"

#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$(dirname "$DIR")"

cd "$ROOT_DIR"
node scripts/sync-version.js

echo "==> Building Rust release library for aarch64-apple-ios..."
RUSTFLAGS="-C link-arg=-undefined -C link-arg=dynamic_lookup" cargo build \
  --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-ios \
  --release

echo "==> Merging static library with Swift objects using libtool..."
mkdir -p src-tauri/gen/apple/Externals/arm64/release

# Find the newest tauri out dir and tauri-plugin-log out dir
TAURI_OUT=$(find src-tauri/target/aarch64-apple-ios/release/build -type d -name "Tauri" | sort | tail -n 1)
PLUGIN_LOG_OUT=$(find src-tauri/target/aarch64-apple-ios/release/build -type d -name "tauri-plugin-log" | sort | tail -n 1)

libtool -static -o src-tauri/gen/apple/Externals/arm64/release/libapp.a \
  src-tauri/target/aarch64-apple-ios/release/libapp_lib.a \
  "$TAURI_OUT"/out/Intermediates.noindex/SwiftRs.build/Release-iphoneos/SwiftRs-t.build/Objects-normal/arm64/*.o \
  "$TAURI_OUT"/out/Intermediates.noindex/Tauri.build/Release-iphoneos/Tauri-t.build/Objects-normal/arm64/*.o \
  "$PLUGIN_LOG_OUT"/out/Intermediates.noindex/tauri-plugin-log.build/Release-iphoneos/tauri-plugin-log-t.build/Objects-normal/arm64/*.o

echo "==> Successfully created src-tauri/gen/apple/Externals/arm64/release/libapp.a!"

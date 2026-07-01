#!/bin/bash
set -e

# Script to align and sign the Android APK locally

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0;3m' # No Color
NC_BOLD='\033[0;1m'
CLEAR='\033[0m'

echo -e "${GREEN}=========================================${CLEAR}"
echo -e "${GREEN}      Android APK Signing & Alignment     ${CLEAR}"
echo -e "${GREEN}=========================================${CLEAR}"

# 1. Locate the Android SDK and build-tools
ANDROID_SDK_PATH="$HOME/Library/Android/sdk"
if [ ! -d "$ANDROID_SDK_PATH" ]; then
  echo -e "${RED}Error: Android SDK not found at $ANDROID_SDK_PATH${CLEAR}"
  echo "Please set your Android SDK path or install the Android SDK."
  exit 1
fi

# Find the latest build-tools directory
BUILD_TOOLS_DIR=$(ls -d $ANDROID_SDK_PATH/build-tools/* 2>/dev/null | sort -V | tail -n 1)
if [ -z "$BUILD_TOOLS_DIR" ]; then
  echo -e "${RED}Error: No build-tools found in $ANDROID_SDK_PATH/build-tools/${CLEAR}"
  exit 1
fi

ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"

echo -e "Using build-tools from: ${YELLOW}$BUILD_TOOLS_DIR${CLEAR}"

# 2. Locate the unsigned APK
echo "Searching for unsigned release APK..."
UNSIGNED_APK=$(find src-tauri/gen/android -name "*release-unsigned.apk" | head -n 1)

if [ -z "$UNSIGNED_APK" ]; then
  # Fallback: search for any release apk that isn't signed
  UNSIGNED_APK=$(find src-tauri/gen/android -name "*release.apk" | grep -v "signed" | head -n 1)
fi

if [ -z "$UNSIGNED_APK" ] || [ ! -f "$UNSIGNED_APK" ]; then
  echo -e "${RED}Error: Unsigned release APK not found.${CLEAR}"
  echo "Please run 'npm run android:build' first to compile the app."
  exit 1
fi

echo -e "Found unsigned APK: ${YELLOW}$UNSIGNED_APK${CLEAR}"

# 3. Prompt for Keystore Details (use defaults or env vars if present)
KEYSTORE_PATH=${ANDROID_KEYSTORE_PATH:-"mava-gems-stock.keystore"}
KEY_ALIAS=${ANDROID_KEY_ALIAS:-"mava-gems-key"}

if [ ! -f "$KEYSTORE_PATH" ]; then
  echo -e "${YELLOW}Keystore file '$KEYSTORE_PATH' not found in the project root.${CLEAR}"
  read -p "Enter path to your keystore file: " KEYSTORE_PATH
  if [ ! -f "$KEYSTORE_PATH" ]; then
    echo -e "${RED}Error: Keystore file not found at '$KEYSTORE_PATH'.${CLEAR}"
    echo "To generate one, run: keytool -genkey -v -keystore mava-gems-stock.keystore -alias mava-gems-key -keyalg RSA -keysize 2048 -validity 10000"
    exit 1
  fi
fi

if [ -z "$ANDROID_KEYSTORE_PASSWORD" ]; then
  read -s -p "Enter Keystore Password: " KEYSTORE_PASSWORD
  echo ""
else
  KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
fi

if [ -z "$ANDROID_KEY_PASSWORD" ]; then
  read -s -p "Enter Key Password (press Enter if same as keystore): " KEY_PASSWORD
  echo ""
  if [ -z "$KEY_PASSWORD" ]; then
    KEY_PASSWORD="$KEYSTORE_PASSWORD"
  fi
else
  KEY_PASSWORD="$ANDROID_KEY_PASSWORD"
fi

# 4. Setup Output Directory
mkdir -p dist-android
VERSION=$(node -p "require('./package.json').version")
ALIGNED_APK="dist-android/mava-gems-stock-android-aligned.apk"
FINAL_SIGNED_APK="dist-android/mava-gems-stock-android-v${VERSION}.apk"

# Clean previous outputs
rm -f "$ALIGNED_APK" "$FINAL_SIGNED_APK"

# 5. Run Zipalign
echo "Aligning APK..."
"$ZIPALIGN" -v 4 "$UNSIGNED_APK" "$ALIGNED_APK" > /dev/null

# 6. Run Apksigner
echo "Signing APK..."
"$APKSIGNER" sign \
  --ks "$KEYSTORE_PATH" \
  --ks-pass pass:"$KEYSTORE_PASSWORD" \
  --key-pass pass:"$KEY_PASSWORD" \
  --ks-key-alias "$KEY_ALIAS" \
  --out "$FINAL_SIGNED_APK" \
  "$ALIGNED_APK"

# Clean temporary aligned but unsigned apk
rm -f "$ALIGNED_APK"

# 7. Verify Signature
echo "Verifying signature..."
"$APKSIGNER" verify --verbose "$FINAL_SIGNED_APK"

echo -e "${GREEN}=========================================${CLEAR}"
echo -e "${GREEN}Success! Signed APK generated at:${CLEAR}"
echo -e "${NC_BOLD}$FINAL_SIGNED_APK${CLEAR}"
echo -e "${GREEN}=========================================${CLEAR}"

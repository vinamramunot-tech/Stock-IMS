#!/bin/bash
set -e

echo ""
echo "  📱 iOS Dev - Select a device"
echo "  ─────────────────────────────"

# Gather simulators
SIM_NAMES=()
SIM_UDIDS=()
while IFS='|' read -r name udid; do
  if [ -n "$name" ] && [ -n "$udid" ]; then
    SIM_NAMES+=("$name")
    SIM_UDIDS+=("$udid")
  fi
done < <(xcrun simctl list devices available -j | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['isAvailable']:
            print(d['name'] + ' (' + runtime.split('.')[-1].replace('-', ' ') + ')|' + d['udid'])
" 2>/dev/null | sort -u)

# Gather physical devices
PHYS_NAMES=()
while IFS= read -r line; do
  [ -n "$line" ] && PHYS_NAMES+=("$line")
done < <(xcrun devicectl list devices 2>/dev/null | awk '/iPhone|iPad/{print $1}' || echo "")

# Build combined list
DEVICES=()
UDIDS=()
TYPES=()  # "sim" or "device"

for i in "${!SIM_NAMES[@]}"; do
  DEVICES+=("${SIM_NAMES[$i]}")
  UDIDS+=("${SIM_UDIDS[$i]}")
  TYPES+=("sim")
done

# Check for physical device via system_profiler (more reliable)
PHYS_RAW=$(system_profiler SPUSBDataType 2>/dev/null | grep -A2 "iPhone\|iPad" | grep -oE "0x[0-9a-f]+" | head -1 || true)

# Use idevice_id if available (libimobiledevice)
if command -v idevice_id &>/dev/null; then
  while IFS= read -r udid; do
    name=$(ideviceinfo -u "$udid" -k DeviceName 2>/dev/null || echo "iPhone (USB)")
    DEVICES+=("$name [Physical]")
    UDIDS+=("$udid")
    TYPES+=("device")
  done < <(idevice_id -l 2>/dev/null)
fi

if [ ${#DEVICES[@]} -eq 0 ]; then
  echo "  No devices found."
  exit 1
fi

# Print menu
for i in "${!DEVICES[@]}"; do
  printf "  %2d) %s\n" "$((i+1))" "${DEVICES[$i]}"
done

echo ""
printf "  Enter number: "
read -r CHOICE

IDX=$((CHOICE - 1))

if [ "$IDX" -lt 0 ] || [ "$IDX" -ge "${#DEVICES[@]}" ]; then
  echo "  Invalid choice."
  exit 1
fi

SELECTED_NAME="${DEVICES[$IDX]}"
SELECTED_UDID="${UDIDS[$IDX]}"
SELECTED_TYPE="${TYPES[$IDX]}"

echo ""
echo "  ▶ Launching on: $SELECTED_NAME"

if [ "$SELECTED_TYPE" = "sim" ]; then
  # Boot if not already booted
  STATE=$(xcrun simctl list devices 2>/dev/null | grep "$SELECTED_UDID" | grep -oE 'Booted|Shutdown' || echo "Shutdown")
  if [ "$STATE" != "Booted" ]; then
    echo "  Booting simulator..."
    xcrun simctl boot "$SELECTED_UDID" 2>/dev/null || true
  fi
  open -a Simulator 2>/dev/null || true
  sleep 2
  # Extract just the device name (strip runtime suffix)
  DEV_NAME=$(echo "$SELECTED_NAME" | sed 's/ (.*)//')
  exec npx tauri ios dev "$DEV_NAME"
else
  exec npx tauri ios dev --host
fi

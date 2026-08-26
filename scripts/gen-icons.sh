#!/usr/bin/env bash
# Generates every app icon from the brand mark.
#
# Source: public/ds/logo/logo-mark.png (the Republic roundel).
# It is NOT fetched from the design project: DesignSync's get_file caps a read
# at 256 KiB and the mark is larger, so every copy pulled that way arrives
# truncated at exactly 196608 bytes with no IEND chunk. Keep the real file in
# the repo and regenerate from it.
#
# sips ships with macOS, so this needs no image library.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=public/ds/logo/logo-app.png

BRAND=public/ds/logo/logo-mark.png
[ -f "$BRAND" ] || { echo "missing $BRAND — drop the brand mark there first"; exit 1; }
# Rebuild the app master (navy ground) whenever the brand mark is newer.
if [ ! -f "$SRC" ] || [ "$BRAND" -nt "$SRC" ]; then
  TMP=$(mktemp -d)
  sips -s format png -z 1024 1024 "$BRAND" --out "$TMP/m.png" >/dev/null
  python3 scripts/make-app-mark.py "$TMP/m.png" "$SRC"
  rm -rf "$TMP"
fi
tail -c 8 "$SRC" | xxd -p | grep -q '49454e44ae426082' \
  || { echo "$SRC is truncated (no IEND chunk) — get a complete copy"; exit 1; }

mkdir -p public/icons
gen() { sips -s format png -z "$1" "$1" "$SRC" --out "$2" >/dev/null; printf '  %-30s %sx%s\n' "$2" "$1" "$1"; }

gen  32 src/app/icon.png            # browser tab
gen 180 src/app/apple-icon.png      # iPhone home screen
gen 192 public/icons/icon-192.png   # manifest
gen 512 public/icons/icon-512.png   # manifest / splash
echo "done"

#!/usr/bin/env bash
# Runs before every Bash tool call — warns if APK inspection tools are missing.

WARNINGS=()

# readelf or objdump needed only for /inspect-apk
if ! command -v readelf &>/dev/null && ! command -v objdump &>/dev/null; then
  WARNINGS+=("readelf/objdump not found — /inspect-apk binary checks will be unavailable. Install binutils to enable.")
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "⚠️  rn-compliance-analyst:" >&2
  for w in "${WARNINGS[@]}"; do
    echo "  • $w" >&2
  done
fi

exit 0

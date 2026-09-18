---
name: inspect-apk
description: >
  Deep binary inspection of a built APK — checks every native .so library for 16 KB
  page-size alignment (PT_LOAD p_align). Use after running a compliance scan to verify
  the built artifact, not just the build config.
---

# inspect-apk

Inspect every native `.so` file in a built APK for 16 KB page-size alignment.

## Arguments

`$ARGUMENTS` may contain:
- A path to a specific APK file
- A project root path (auto-discovers APK under `android/app/build/outputs/apk/`)
- Nothing (auto-discovers under current working directory)

## Prerequisites

Requires `readelf` or `objdump` (part of `binutils`). If neither is available, report the limitation and stop.

---

## Steps

### 1. Locate the APK

If an explicit `.apk` path is in `$ARGUMENTS`, use it.

Otherwise, use Glob to find APKs under:
- `android/app/build/outputs/apk/release/*.apk`
- `android/app/build/outputs/apk/debug/*.apk`

Prefer release over debug. If multiple found, show a list and ask the user to pick.
If none found, tell the user to build first:
```
No APK found. Run:
  cd android && ./gradlew assembleRelease
```
and stop.

### 2. Check tool availability

Run:
```bash
command -v readelf || command -v objdump
```
If neither exists, output:
```
⚠ readelf/objdump not available. Install binutils:
  macOS:  brew install binutils
  Linux:  apt-get install binutils  (or equivalent)
```
and stop.

### 3. Extract native libraries

```bash
TMPDIR=$(mktemp -d)
unzip -o "$APK_PATH" "lib/arm64-v8a/*.so" "lib/armeabi-v7a/*.so" "lib/x86_64/*.so" -d "$TMPDIR" 2>/dev/null
```

If no `.so` files extracted, report "No native libraries found in APK — no binary checks required."

### 4. Check each .so for 16 KB alignment

For each extracted `.so` file, run:

**Using readelf (preferred):**
```bash
readelf -l "$SO_FILE" 2>/dev/null | grep -E "LOAD|p_align"
```

**Using objdump (fallback):**
```bash
objdump -p "$SO_FILE" 2>/dev/null | grep -i "align"
```

A PT_LOAD segment is **16 KB compliant** if `p_align = 0x4000` (16384).
A PT_LOAD segment is **4 KB only** if `p_align = 0x1000` (4096).

Record: library name, ABI, alignment value, pass/fail.

### 5. Identify npm packages for failing libraries

For failing `.so` files, attempt to map to their npm package. Common patterns:
- `libreanimated.so` → `react-native-reanimated` (min compliant: 3.6.0)
- `libhermes.so` → `react-native` (min compliant: 0.74.0)
- `libfbjni.so` → `com.facebook.fbjni:fbjni` (Android dependency, not npm)
- `libturbomodulejsijni.so` → `react-native` (min compliant: 0.74.0)
- `librnscreens.so` → `react-native-screens` (min compliant: 3.30.0)
- `libvisionreactnative.so` → `react-native-vision-camera` (min compliant: 4.0.0)

For unrecognised libraries, note them as "unknown — verify with library maintainer."

### 6. Clean up

```bash
rm -rf "$TMPDIR"
```

### 7. Report

```
APK: app-release.apk

arm64-v8a (6 libraries)
  ✓  libhermes.so              p_align=0x4000  (16 KB)
  ✓  libturbomodulejsijni.so   p_align=0x4000  (16 KB)
  ✗  libreanimated.so          p_align=0x1000  (4 KB)  → upgrade react-native-reanimated ≥ 3.6.0
  ✓  libfbjni.so               p_align=0x4000  (16 KB)

armeabi-v7a
  ✓  libhermes.so              p_align=0x4000  (16 KB)
  ✗  libreanimated.so          p_align=0x1000  (4 KB)  → upgrade react-native-reanimated ≥ 3.6.0

Summary: 4 of 6 libraries compliant.

Action required:
  npm install react-native-reanimated@3.6.0  (or higher)
  Then rebuild: cd android && ./gradlew assembleRelease
```

If all libraries pass:
```
✓ All X native libraries are 16 KB page-size compliant.
```

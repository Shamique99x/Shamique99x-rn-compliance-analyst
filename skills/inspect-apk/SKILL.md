---
name: inspect-apk
description: Inspect a built APK's native libraries for 16 KB page-size compliance. Checks ELF alignment and compression of every .so file. Use when the user wants to inspect a specific APK or verify a build before submission.
---

# inspect-apk — APK Native Library Inspector

Inspect every `.so` file inside an APK for 16 KB page-size compliance without running a full project scan.

## Arguments (`$ARGUMENTS`)

| Value | Behaviour |
|---|---|
| _(empty)_ | Auto-discover APK in `android/app/build/outputs/apk/` |
| `release` | Look specifically for a release APK |
| `debug` | Look specifically for a debug APK |
| `/path/to/app.apk` | Inspect that exact file |

## Steps

### 1. Resolve APK path

Call `compliance_inspect_apk` with:
- `projectPath`: current working directory
- `apkPath`: the value of `$ARGUMENTS` if it looks like a file path (starts with `/`, `./`, `C:\`, or ends with `.apk`), otherwise pass `variant` = `$ARGUMENTS` (e.g. "release" or "debug")

### 2. Handle errors

If `error` is set in the result:
> ✗ Could not inspect APK: <error>
>
> Make sure you have built the APK first:
> `cd android && ./gradlew assembleDebug`

Stop here.

### 3. Display results

Print a header:
```
APK Inspection: <apk_path>
Libraries checked: <libraries_checked>
```

Then group by ABI and list every library with its status:

```
arm64-v8a  (<N> libraries)
  ✓  libhermes.so          aligned=0x4000  stored
  ✓  libfbjni.so           aligned=0x4000  stored
  ✗  libreanimated.so      aligned=0x1000  stored   ← PT_LOAD alignment too low
  ✗  liblegacybridge.so    aligned=0x4000  compressed ← must be stored uncompressed

armeabi-v7a  (<N> libraries)
  ✓  libhermes.so          aligned=0x1000  stored   (32-bit: 4 KB is acceptable)
```

Note: for 32-bit ABI (armeabi-v7a), 4 KB alignment is acceptable — the 16 KB requirement only applies to 64-bit (arm64-v8a) libraries.

### 4. Show upgrade suggestions

If `upgrades` is non-empty, list them with confidence annotations:

```
Upgrade suggestions (<N> packages)
  • react-native              0.73.6 → 0.74.0+   (confirmed)
    Triggered by: arm64-v8a/libhermes.so
  • react-native-vision-camera  3.x  → 4.0.0+   ⚠️ community-reported
    Triggered by: arm64-v8a/libVisionCamera.so
  🤖 expo-av  13.6.0 → 13.10.0+ — AI-identified
  ❓ libcustom.so — unknown package, check with maintainer
```

### 5. Ask for confirmation before upgrading

If there are actionable upgrades (valid semver, not unknown), ask:

```
I can run these upgrades for you now:

  • react-native@0.74.0
  • react-native-vision-camera@4.0.0

Package manager: <npm|yarn|pnpm|bun> (auto-detected from lock file)

Shall I run these upgrades now? [y/N]
```

Wait for the user's response.
- If **yes** → go to step 6
- If **no** → print the manual commands and stop:
  ```
  To upgrade manually:
    npm install react-native@0.74.0 react-native-vision-camera@4.0.0
  ```

### 6. Run upgrades

Call `compliance_upgrade_libraries` with:
- `projectPath`: current working directory
- `upgrades`: array of `{ name, min_version }` for every actionable entry

### 7. Report results

```
Running: npm install react-native@0.74.0 react-native-vision-camera@4.0.0

  ✓ react-native@0.74.0
  ✓ react-native-vision-camera@4.0.0

Done. Rebuild your APK and re-run /rn-compliance:inspect-apk to verify.
```

If any upgrades failed, show the error output and suggest running the command manually.

### 8. Summary

```
✓ All libraries are 16 KB page-size compliant.
```
or
```
✗ <N> non-compliant librar(y/ies) found.
```

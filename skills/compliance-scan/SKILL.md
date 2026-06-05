---
name: compliance-scan
description: Scan a React Native project for Android/iOS app store policy violations and optionally auto-fix them. Use when the user runs /rn-compliance:compliance-scan or asks to check app store compliance, policy violations, targetSdk, page size alignment, or PrivacyInfo requirements.
---

# compliance-scan — React Native Policy Compliance Agent

Use this skill when the user runs `/rn-compliance:compliance-scan` (optionally with `android`, `ios`, or `--refresh` arguments).

## What this skill does

Scans the current React Native project for Android and iOS app store policy violations, reports them to the user, and — with explicit user confirmation — automatically applies code-level fixes.

---

## Step-by-step instructions

### 1. Determine arguments

- If the user typed `android`, set `platforms = ["android"]`
- If the user typed `ios`, set `platforms = ["ios"]`
- Otherwise, set `platforms = ["android", "ios"]`
- If the user typed `--refresh`, run `compliance_refresh_policies` first (step 2a)

### 2a. (If --refresh) Refresh policies

Call `compliance_refresh_policies`. Report the result:
- "Policy database updated to version X" if updated
- "Policy database is already up to date" if not
- Any per-platform errors

### 2b. Check if cache is stale

Call `compliance_cache_status`. If either platform shows `stale: true`:
> Policy database for [platform] is more than 24 hours old. Run `/rn-compliance:compliance-scan --refresh` to fetch the latest rules before scanning.

Continue without blocking — stale cache still uses bundled policies.

### 3. Scan the project

Call `compliance_scan` with:
- `projectPath`: the current working directory
- `platforms`: from step 1

### 4. Note library upgrades (if any)

If `library_upgrades_required` is non-empty, show a brief notice before the violations list — do NOT suggest manual steps here, those come in step 9:

```
⚠️  <N> library upgrade(s) required — will be handled after config fixes (step 9).
```

### 5. Present violations

Group by platform, then by severity (errors first, then warnings).

Use this format for each violation:

```
[ERROR] <policy_name>
  <description>
  Details: <details>
  Files affected: <affected_files joined by ", ">
  Docs: <docs_url>
  Auto-fixable: Yes / No
```

End the list with a summary line:
> Found X violation(s): Y error(s), Z warning(s). Y are auto-fixable.

If there are no violations:
> ✓ No compliance violations found. Your project meets all current Android and iOS store policies.

### 6. Ask for confirmation before fixing config violations

If there are auto-fixable violations:

> Proceed with automatic fixes for the X auto-fixable violation(s)? [y/N]
>
> Note: Original files will be backed up with a `.bak` extension before any changes are made.

Wait for the user's response. If they say no or anything other than yes/y/proceed, skip to step 9.

### 7. Apply config fixes

Call `compliance_fix_all` with `projectPath` = current working directory.

### 8. Report config fix results

For each fix in `applied`:
- If `success: true` and `changes` is non-empty: list each change's file and description
- If `success: false`: show the error

For each item in `skipped`: note that no auto-fix is available (manual action required — link to docs_url).

Example output:

```
Fixes applied:

  android/gradle.properties
    + Added android.bundle.enableUncompressedNativeLibs=true

  android/app/build.gradle
    + Bumped compileSdkVersion and targetSdkVersion to 35
    + Added -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON to cmake arguments

  ios/PrivacyInfo.xcprivacy
    + Created PrivacyInfo.xcprivacy with default template
    + Added NSPrivacyAccessedAPITypes entries for NSUserDefaults, NSFileManager

Backup files created with .bak extension alongside each modified file.

Manual action required:
  • ios-xcode-version: Xcode must be upgraded to 16.0+ manually.
    See: https://developer.apple.com/news/upcoming-requirements/
```

### 9. Ask for confirmation before upgrading libraries

**Always run this step** if `library_upgrades_required` is non-empty — even if the user skipped config fixes in step 6.

Separate into two groups:
- **Actionable** — entries with a valid semver `min_version` (can be installed)
- **Skip** — entries where `confidence` is `"unknown"` (no version known)

If there are actionable entries, show each one with its confidence annotation, then ask:

```
The following library upgrades are required. I can run these for you now:

  • react-native              0.73.6 → 0.74.0+   (confirmed)
  • react-native-reanimated  3.4.0  → 3.6.0+    (confirmed)
  • react-native-vision-camera 3.x  → 4.0.0+    ⚠️ community-reported — verify before upgrading
  🤖 expo-av 13.6.0 → 13.10.0+ — AI-identified, verify before upgrading

Package manager: <npm|yarn|pnpm|bun> (auto-detected from lock file)

Shall I run these upgrades now? [y/N]
```

Wait for the user's response.
- If **yes** → continue to step 10
- If **no** → print the equivalent manual commands and stop:
  ```
  To upgrade manually:
    npm install react-native@0.74.0 react-native-reanimated@3.6.0
  ```

### 10. Run library upgrades

Call `compliance_upgrade_libraries` with:
- `projectPath`: current working directory
- `upgrades`: array of `{ name, min_version }` for every actionable entry

### 11. Report upgrade results

Show the command that was run, then for each package:
- ✓ if success
- ✗ + error message if failed

```
Running: yarn add react-native-reanimated@3.6.0 react-native-screens@3.29.0

  ✓ react-native-reanimated@3.6.0
  ✓ react-native-screens@3.29.0

Library upgrades complete. Re-build your APK and re-run the scan to confirm compliance.
```

If any upgrades failed, show the raw output and suggest running the command manually.

For manual-only entries (unknown versions):
```
Manual action required:
  • libcustom-sdk.so — could not identify the npm package.
    Inspect the APK manually or check with the library maintainer.
```

### 12. Offer APK inspection

After all config fixes and library upgrades are done (or skipped), if the scanned platforms include `android`, ask:

```
Would you like to inspect the APK for 16 KB page-size compliance as well?
This checks the actual compiled .so binaries inside the APK — a deeper check than the source-level scan.

(Requires a built APK. I can build one if none exists.)  [y/N]
```

- If **no** → stop here.
- If **yes** → run the full inspect-apk flow:

  1. Call `compliance_inspect_apk` with `projectPath` = current working directory.

  2. **If no APK found** — ask:
     ```
     No APK found. Should I build one now? (debug variant)  [y/N]
     ```
     - If **no** → print `cd android && ./gradlew assembleDebug` and stop.
     - If **yes** → run:
       ```bash
       cd android && ./gradlew assembleDebug 2>&1
       ```
       - If build **succeeds** → retry `compliance_inspect_apk` and continue.
       - If build **fails** → analyse errors, apply relevant `compliance_fix` calls automatically, retry the build once more. If it still fails, show remaining errors and stop.

  3. **Display APK results** — group by ABI, show ✓/✗ per library:
     ```
     APK Inspection: <apk_path>
     Libraries checked: <N>

     arm64-v8a  (<N> libraries)
       ✓  libhermes.so          aligned=0x4000  stored
       ✗  libreanimated.so      aligned=0x1000  stored  ← PT_LOAD alignment too low

     armeabi-v7a  (<N> libraries)
       ✓  libhermes.so          aligned=0x1000  stored  (32-bit: 4 KB is acceptable)
     ```

  4. **Show upgrade suggestions** from `upgrades` — same format as step 9, ask for confirmation before running.

  5. **Final summary**:
     ```
     ✓ All libraries are 16 KB page-size compliant.
     ```
     or
     ```
     ✗ <N> non-compliant library/libraries found. Upgrade the packages above and rebuild.
     ```

---

## Tone and formatting rules

- Lead with library upgrade warnings before showing violations
- Keep violation descriptions brief — one sentence max
- Never apply fixes without explicit user confirmation
- Always mention that `.bak` backups were created
- If a fix fails, show the error and suggest the manual equivalent
- Do not explain what each policy is in depth — link to docs_url instead

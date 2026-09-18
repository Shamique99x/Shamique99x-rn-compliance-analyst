---
name: compliance-scan
description: >
  Scan a React Native or Capacitor project for Android/iOS app store compliance violations,
  apply all auto-fixable issues, and report any library upgrades required. Handles both
  standard Gradle DSL and KTS build files.
---

# compliance-scan

Scan the project for Android/iOS policy violations and optionally apply fixes.

## Arguments

`$ARGUMENTS` may contain:
- A project path (default: current working directory)
- `android` or `ios` to limit to one platform (default: both)
- `--fix` to apply auto-fixes without prompting

## Policy thresholds (current as of 2026-Q3)

### Android
| Policy | Threshold | Severity | Auto-fix |
|--------|-----------|----------|----------|
| 16 KB page size | `android.bundle.enableUncompressedNativeLibs=true` + cmake arg | error | yes |
| targetSdkVersion | ≥ 35 | error | yes |
| compileSdkVersion | ≥ 35 | error | yes |
| Android Gradle Plugin | ≥ 8.5.1 | warning | yes |
| Gradle wrapper | ≥ 8.6 | warning | yes |
### iOS
| Policy | Threshold | Severity | Auto-fix |
|--------|-----------|----------|----------|
| PrivacyInfo.xcprivacy exists | file must exist | error | yes |
| Required Reason APIs declared | all used APIs declared | error | yes |
| Min deployment target | ≥ 15.1 (Podfile + pbxproj) | error | yes |
| Xcode version | ≥ 16.0 | warning | no |

---

## Steps

### 0. Pre-check — compliance config

Before scanning, check if `.rn-compliance.json` exists in the project root:

```bash
cat .rn-compliance.json 2>/dev/null
```

**If the file exists:** read it and proceed to step 1.

**If the file does not exist:** ask the user for the following, one prompt:

```
No .rn-compliance.json found. Please provide a few details to set it up:

1. Base branch for PRs (e.g. main, master, develop):
2. GitHub reviewer username:
3. PR labels (comma-separated, or press Enter to skip):
```

Once the user responds, create `.rn-compliance.json` in the project root with their answers:

```json
{
  "pr": {
    "base_branch": "<answer 1>",
    "reviewer": "<answer 2>",
    "labels": ["<answer 3 split by comma>"]
  }
}
```

If labels were skipped, use `["compliance"]` as default.

Confirm: `✓ Created .rn-compliance.json — proceeding with scan.`

Then proceed to step 1.

---

### 0b. Scrape latest policy thresholds

Fetch current requirements directly from official sources at scan time. No cache, no scheduled job — always the live values.

Fetch each page using Bash:

```bash
curl -sf "https://developer.android.com/google/play/requirements/target-sdk" -o /tmp/policy-android-target.html 2>/dev/null
curl -sf "https://developer.android.com/guide/practices/page-sizes" -o /tmp/policy-android-pagesize.html 2>/dev/null
curl -sf "https://developer.apple.com/news/upcoming-requirements/" -o /tmp/policy-ios.html 2>/dev/null
```

Extract from the fetched pages:

| Value to extract | Source page | Look for |
|-----------------|-------------|----------|
| `targetSdkVersion` minimum | android-target.html | "new apps and app updates must target API level X" |
| 16 KB page size required from API | android-pagesize.html | "Android X (API Y)" |
| iOS min deployment target | policy-ios.html | "iOS X or later" near "App Store" |
| Xcode minimum | policy-ios.html | "Xcode X or later" |

**If fetch succeeds:** extract the threshold values, update the local policy files:

```bash
PLUGIN_POLICIES=$(find "$HOME/.claude" -path "*/rn-compliance-analyst/policies" -type d 2>/dev/null | head -1)
```

Write the updated thresholds into `$PLUGIN_POLICIES/android.json` and `$PLUGIN_POLICIES/ios.json` using Edit tool. Then use these updated files as the policy source for this run. Log:
```
✓ Live policy thresholds fetched and saved.
  Android targetSdk ≥ 36   (developer.android.com)
  iOS deployment target ≥ 15.1   (developer.apple.com)
  Xcode ≥ 16.0
```

**If fetch fails** (no network, rate-limited, parsing error): read the existing local policy files from `$PLUGIN_POLICIES/android.json` and `$PLUGIN_POLICIES/ios.json` as fallback. Log:
```
⚠ Could not fetch live policies — using last saved policy data.
```

If local files also not found, fall back to the embedded thresholds table in this skill.

---

### 1. Parse arguments

- Extract `projectPath` from `$ARGUMENTS` if a path is given, otherwise use current working directory.
- Extract `platforms`: `["android"]` if "android" in args, `["ios"]` if "ios" in args, otherwise `["android", "ios"]`.
- Note whether `--fix` flag is present.

### 2. Detect project type

Read `<projectPath>/package.json`.

- Contains `react-native` → `react-native`
- Neither → `unknown` (proceed with generic Android/iOS checks)

---

### 3. Android checks

Skip entirely if `android` not in platforms.

#### 3a. Locate build files

Try these files in order, use the first that exists:
- `<projectPath>/android/app/build.gradle`
- `<projectPath>/android/app/build.gradle.kts`

Also locate:
- `<projectPath>/android/build.gradle` (root, for AGP classpath)
- `<projectPath>/android/gradle.properties`
- `<projectPath>/android/gradle/wrapper/gradle-wrapper.properties`

#### 3b. Check 16 KB page size alignment

**Check 1 — gradle.properties:**
Read `android/gradle.properties`. Look for the line:
```
android.bundle.enableUncompressedNativeLibs=true
```
PASS if the key exists with value `true`. FAIL otherwise.

**Check 2 — cmake arg (optional — only FAIL if CMake is used):**
Read `android/app/build.gradle` (or .kts). Search for an `externalNativeBuild` or `cmake` block.
- If CMake block exists: check for `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` in `cppFlags` or `arguments`. FAIL if missing.
- If no CMake block: this check does not apply.

#### 3c. Check targetSdkVersion and compileSdkVersion

Read `android/app/build.gradle` (or .kts).
Extract `targetSdkVersion` and `compileSdkVersion` values (they may appear as bare integers or via `android { defaultConfig { ... } }`).
FAIL if either value is below 35.

Also check `android/app/build.gradle` for `targetSdk` / `compileSdk` (KTS style aliases).

#### 3d. Check Android Gradle Plugin version

Read `android/build.gradle` (root). Find the classpath dependency:
```
classpath("com.android.tools.build:gradle:X.Y.Z")  // KTS
classpath 'com.android.tools.build:gradle:X.Y.Z'   // Groovy
```
Extract version `X.Y.Z`. FAIL (warning) if version < 8.5.1.

If the root build.gradle uses `plugins {}` DSL instead of classpath, check:
```
id("com.android.application") version "X.Y.Z"
```

#### 3e. Check Gradle wrapper version

Read `android/gradle/wrapper/gradle-wrapper.properties`.
Find `distributionUrl=...gradle-X.Y.Z-...zip`. Extract version.
FAIL (warning) if version < 8.6.

---

### 4. iOS checks

Skip entirely if `ios` not in platforms.

#### 4a. Check PrivacyInfo.xcprivacy exists

Check if `<projectPath>/ios/PrivacyInfo.xcprivacy` exists (use Glob: `ios/PrivacyInfo.xcprivacy`).
FAIL if missing.

#### 4b. Check Required Reason APIs

Scan source files for API usage. Use Grep across `<projectPath>/src`, `<projectPath>/app`, `<projectPath>/ios`, and the project root for files with extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.m`, `.mm`, `.swift`.

Patterns to search for:
- `NSUserDefaults` / `UserDefaults.standard` / `AsyncStorage` → category `NSPrivacyAccessedAPICategoryUserDefaults`
- `NSFileManager` / `FileManager.default` / `attributesOfItem` / `creationDate` / `modificationDate` → category `NSPrivacyAccessedAPICategoryFileTimestamp`
- `systemUptime` / `mach_absolute_time` / `ProcessInfo.processInfo.systemUptime` → category `NSPrivacyAccessedAPICategorySystemBootTime`
- `volumeAvailableCapacityForImportantUsage` / `volumeTotalCapacity` / `NSFileSystemFreeSize` → category `NSPrivacyAccessedAPICategoryDiskSpace`

For each category with usage found, read `ios/PrivacyInfo.xcprivacy` and check that the category appears in `NSPrivacyAccessedAPITypes` with at least one reason code entry.
FAIL if any used category is missing from the manifest.

#### 4c. Check minimum iOS deployment target

**Podfile:**
Read `ios/Podfile`. Find the line: `platform :ios, 'VERSION'`.
Extract VERSION. FAIL if VERSION < 15.1.

**Xcode project:**
Use Glob `ios/*.xcodeproj/project.pbxproj` to find the pbxproj file.
Read it. Search for `IPHONEOS_DEPLOYMENT_TARGET = VERSION;`.
Extract VERSION. FAIL if any value < 15.1.

#### 4d. Check Xcode version (warning only)

Check if `.xcode-version` or `ios/.xcode-version` exists.
If it exists, read it and extract version number. FAIL (warning) if < 16.0.
If neither file exists: report as warning — "Xcode version file not found; ensure CI uses Xcode 16+"

---

### 5. Report violations

Print a structured report:

```
React Native Compliance Scan
Project: <projectPath>
Type:     <react-native | capacitor | hybrid>

Android
  ✗  16 KB Page Size Alignment          [ERROR]   android/gradle.properties
  ✓  Target & Compile SDK Version
  ✗  Android Gradle Plugin Version       [WARN]    android/build.gradle
  ✓  Gradle Wrapper Version

iOS
  ✗  Privacy Manifest File               [ERROR]   ios/PrivacyInfo.xcprivacy missing
  ✓  Required Reason APIs Declaration
  ✓  Minimum iOS Deployment Target
  ⚠  Xcode Version Requirement          [WARN]    .xcode-version not found

Summary: X violations (Y errors, Z warnings)

Library upgrades required:
  • react-native ≥ 0.74.0 — 16 KB page-size compatible Hermes engine
  • @capacitor/android ≥ 7.0.0 — upgrade to support targetSdk 35 (current major 6 supports up to 34)
```

If no violations: print `✓ All checks passing.`

---

### 6. Apply fixes

Apply all auto-fixable violations immediately without prompting. Do not ask for confirmation.

For each auto-fixable violation, apply the relevant fix below.

#### Fix: 16 KB page size

**gradle.properties fix:**
Read `android/gradle.properties`. If `android.bundle.enableUncompressedNativeLibs` already exists, update its value to `true`. If missing, append:
```
android.bundle.enableUncompressedNativeLibs=true
```

**cmake arg fix (only if CMake block exists):**
In `android/app/build.gradle`, find the `arguments` or `cppFlags` line inside the cmake/externalNativeBuild block. Append `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` to it.

If `android/app/CMakeLists.txt` exists, read it and check if the linker flag `-Wl,-z,max-page-size=16384` is already present. If not, add it to `target_link_options` or `set_target_properties` for the main library target.

#### Fix: targetSdkVersion / compileSdkVersion

In `android/app/build.gradle` (or .kts), update `targetSdkVersion` and `compileSdkVersion` to 35.
Handle both Groovy (`targetSdkVersion 34`) and KTS (`targetSdk = 34`) syntax.

#### Fix: Android Gradle Plugin version

In `android/build.gradle` (root), update the AGP classpath version to `8.5.1`.
Replace e.g. `com.android.tools.build:gradle:8.3.0` → `com.android.tools.build:gradle:8.5.1`.

#### Fix: Gradle wrapper version

In `android/gradle/wrapper/gradle-wrapper.properties`, update `distributionUrl`:
```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.6-all.zip
```

#### Fix: PrivacyInfo.xcprivacy missing

Create `ios/PrivacyInfo.xcprivacy` with this content:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array/>
</dict>
</plist>
```

#### Fix: Required Reason APIs missing

For each API category found in source but missing from `ios/PrivacyInfo.xcprivacy`, add the category entry to the `NSPrivacyAccessedAPITypes` array. Use the first reason code from the list for that category as the default. Example entry for UserDefaults:
```xml
<dict>
    <key>NSPrivacyAccessedAPIType</key>
    <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key>
    <array>
        <string>CA92.1</string>
    </array>
</dict>
```

#### Fix: Min iOS deployment target

**Podfile:** Replace `platform :ios, 'OLD'` with `platform :ios, '15.1'`.

**project.pbxproj:** Replace all occurrences of `IPHONEOS_DEPLOYMENT_TARGET = OLD;` where OLD < 15.1 with `IPHONEOS_DEPLOYMENT_TARGET = 15.1;`.

---

### 7. Post-fix report

After applying fixes, re-run all checks (repeat steps 3 and 4) and print a final report.
Highlight what was fixed and what remains (non-auto-fixable items or blocked fixes).

---

### 8. Library upgrade checks

For each policy that **was failing at scan time** (steps 3–4), regardless of whether a config fix was already applied in step 6, check its `library_requirements` from the table below. Cross-reference the installed version from `package.json` (`dependencies` + `devDependencies`).

Config fixes (gradle.properties, build.gradle, etc.) are not enough on their own for policies that also require a library version — the library upgrade is always required alongside the config fix.

| Failing policy | Library | Min version required |
|----------------|---------|----------------------|
| android-16kb-page-size | react-native | 0.74.0 |
| ios-min-deployment-target | react-native | 0.73.0 |

For each library where the installed version is below the minimum:

1. Report it:
   ```
   ⬆  react-native  installed: 0.71.13  →  required: ≥ 0.74.0
   ```
2. Detect package manager: if `yarn.lock` exists use `yarn add`, otherwise `npm install`.
3. Install immediately without prompting:
   ```bash
   npm install react-native@0.74.0
   ```
   (or the exact `min_version` from the policy requirement)
4. After install completes, re-run the relevant compliance check to confirm it now passes.

If a failing policy has no library requirements, no upgrade action is needed for it.

---

### 9. Raise pull request

After fixes and upgrades are applied, use the `.rn-compliance.json` config read in step 0.

1. Check `gh` is available:
```bash
command -v gh
```
If not available, skip PR and note in summary.

2. Check if there are any committed changes to push. If no changes were made (all checks already passed), skip PR.

3. Create a new branch for the fixes:
```bash
git checkout -b compliance/fix-$(date +%Y%m%d)
```

4. Stage and commit all compliance changes:
```bash
git add -A
git commit -m "fix: apply compliance scan fixes

Auto-applied by rn-compliance-analyst plugin.
$(date +%Y-%m-%d)"
```

5. Push the branch:
```bash
git push origin HEAD
```

6. Raise the PR:
```bash
gh pr create \
  --base "<pr.base_branch>" \
  --title "fix: compliance scan fixes $(date +%Y-%m-%d)" \
  --body "## Compliance Scan Fixes

Auto-generated by the rn-compliance-analyst plugin.

### Policy versions used
- Android: <android.version from fetched JSON, or 'embedded fallback'>
- iOS: <ios.version from fetched JSON, or 'embedded fallback'>

### Changes applied
<list each fix applied>

### Library upgrades installed
<list each library upgrade, or 'none'>

### Remaining manual actions
<list any non-auto-fixable items, or 'none'>

### How to verify
\`\`\`
cd android && ./gradlew assembleDebug
\`\`\`" \
  --reviewer "<pr.reviewer>" \
  $(echo "<pr.labels>" | jq -r '.[] | "--label \(.)"' 2>/dev/null)
```

Report the PR URL in the summary.

---

### 10. Final summary

Print a single summary of the full run:

```
Compliance Scan Complete
─────────────────────────────────────────
Violations found:    X
Auto-fixes applied:  Y
Pull request:        https://github.com/... (or "skipped — no .rn-compliance.json")

Library upgrades installed:
  ⬆  react-native  0.71.13 → 0.74.0   (16 KB page size compliance)

Remaining actions:
  • <any non-auto-fixable items>

To verify the build run manually:
  cd android && ./gradlew assembleDebug
```

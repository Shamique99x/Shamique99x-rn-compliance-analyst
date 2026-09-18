---
name: policies
description: Show all active compliance policy rules, their current thresholds, severity, and version. Use to confirm what the scanner is checking before running a scan.
---

# policies — Policy Rules Reference

Display all active Android and iOS compliance policy rules.

## Steps

### 1. Scrape latest thresholds from official sources

```bash
curl -sf "https://developer.android.com/google/play/requirements/target-sdk" -o /tmp/policy-android-target.html 2>/dev/null
curl -sf "https://developer.android.com/guide/practices/page-sizes" -o /tmp/policy-android-pagesize.html 2>/dev/null
curl -sf "https://developer.apple.com/news/upcoming-requirements/" -o /tmp/policy-ios.html 2>/dev/null
```

If fetch succeeds: extract thresholds, update local `policies/android.json` and `policies/ios.json`, use updated values.
If fetch fails: read existing local policy files as fallback. Log: `⚠ Using last saved policy data.`
If local files also missing: use embedded fallback thresholds.

### 2. Display

```
React Native Compliance — Policy Reference
Version: <android.version> / <ios.version>

ANDROID
──────────────────────────────────────────────────────────────
android-16kb-page-size          [ERROR]   auto-fix: yes
  16 KB Page Size Alignment
  gradle.properties: android.bundle.enableUncompressedNativeLibs=true
  build.gradle: -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON in cmake args

android-target-sdk              [ERROR]   auto-fix: yes
  Target & Compile SDK Version ≥ 35
  Applies to: android/app/build.gradle

android-agp-version             [WARN]    auto-fix: yes
  Android Gradle Plugin ≥ 8.5.1
  Applies to: android/build.gradle classpath

android-gradle-wrapper          [WARN]    auto-fix: yes
  Gradle Wrapper ≥ 8.6
  Applies to: android/gradle/wrapper/gradle-wrapper.properties

iOS
──────────────────────────────────────────────────────────────
ios-privacy-manifest-exists     [ERROR]   auto-fix: yes
  PrivacyInfo.xcprivacy must exist at ios/PrivacyInfo.xcprivacy

ios-privacy-required-reason-apis [ERROR]  auto-fix: yes
  APIs used in source must be declared in PrivacyInfo.xcprivacy
  Tracked categories: UserDefaults, FileTimestamp, SystemBootTime, DiskSpace

ios-min-deployment-target       [ERROR]   auto-fix: yes
  Minimum iOS deployment target ≥ 15.1
  Applies to: ios/Podfile + ios/*.xcodeproj/project.pbxproj

ios-xcode-version               [WARN]    auto-fix: no
  Xcode ≥ 16.0 required for App Store submissions
  Checks: .xcode-version or ios/.xcode-version
```

### 3. Footer

```
Policies updated monthly via GitHub Actions from official Android/iOS developer docs.
Run /compliance-scan to check your project against these rules.
```

---

## Embedded fallback thresholds

Use if policy JSON files cannot be found:

| Check | Threshold |
|-------|-----------|
| targetSdkVersion | 35 |
| compileSdkVersion | 35 |
| AGP | 8.5.1 |
| Gradle wrapper | 8.6 |
| iOS deployment target | 15.1 |
| Xcode | 16.0 |

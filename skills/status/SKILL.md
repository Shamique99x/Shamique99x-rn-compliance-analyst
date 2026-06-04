---
name: status
description: Quick pass/fail compliance status for a React Native project. Use when the user wants a fast health check without fix prompts. Shows one line per policy.
---

# status — Quick Compliance Health Check

Show a compact pass/fail summary. No fix prompts, no confirmation steps.

## Arguments

`$ARGUMENTS` may optionally be `android` or `ios` to limit to one platform.

## Steps

### 1. Scan

Call `compliance_scan` with:
- `projectPath`: current working directory
- `platforms`: `["android"]` if argument is "android", `["ios"]` if "ios", otherwise both

### 2. Display compact table

Print a header line showing the APK inspection status if available:

```
React Native Compliance Status
APK inspection: ✓ 12 libraries checked  (or "not available — build an APK for deep inspection")
Policies version: <policies_version>
```

Then one line per policy, grouped by platform. Show every policy from the scan — both passing and failing:

```
Android
  ✓  Target & Compile SDK Version
  ✓  Android Gradle Plugin Version
  ✗  16 KB Page Size Alignment         [ERROR]  android/gradle.properties
  ✗  16 KB Page Size — APK Verification [ERROR]  arm64-v8a/libreanimated.so

iOS
  ✓  Privacy Manifest File
  ✓  Required Reason APIs Declaration
  ✗  Minimum iOS Deployment Target     [ERROR]  ios/Podfile
  ✓  Xcode Version Requirement
```

For passing policies not in `violations`, infer from the absence of a violation with that `policy_id`.

### 3. Summary line

```
X of Y checks passing  ·  Z error(s)  ·  W warning(s)
Run /rn-compliance:compliance-scan to fix violations.
```

If everything passes:
```
✓  All X checks passing. No violations found.
```

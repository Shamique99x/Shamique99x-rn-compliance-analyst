---
name: status
description: Quick pass/fail compliance health check for a React Native project. Shows one line per policy, no fix prompts.
---

# status — Quick Compliance Health Check

Show a compact pass/fail summary. No fix prompts, no confirmation steps.

## Arguments

`$ARGUMENTS` may optionally contain `android` or `ios` to limit to one platform.

## Steps

### 1. Determine scope

- `projectPath`: current working directory
- `platforms`: `["android"]` if "android" in args, `["ios"]` if "ios" in args, else both

### 2. Run compliance checks

Run the same checks as the `compliance-scan` skill (steps 3 and 4) but do **not** apply any fixes and do **not** prompt the user.

Detect project type from `package.json` (react-native / unknown).

### 3. Display compact table

```
React Native Compliance Status
Project type: <react-native | unknown>

Android
  ✓  Target & Compile SDK Version
  ✓  Android Gradle Plugin Version
  ✓  Gradle Wrapper Version
  ✗  16 KB Page Size Alignment              [ERROR]   android/gradle.properties
  ✗  Android Gradle Plugin Version          [WARN]    android/build.gradle → 8.3.0 < 8.5.1

iOS
  ✓  Privacy Manifest File
  ✓  Required Reason APIs Declaration
  ✗  Minimum iOS Deployment Target         [ERROR]   ios/Podfile → 13.0 < 15.1
  ✓  Xcode Version Requirement
```

### 4. Summary line

```
X of Y checks passing  ·  Z error(s)  ·  W warning(s)
Run /compliance-scan to fix violations.
```

If everything passes:
```
✓ All X checks passing. Project is compliant.
```

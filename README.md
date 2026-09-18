# React Native / Capacitor Compliance — Claude Code Plugin

Scan and auto-fix Android/iOS app store policy violations directly from Claude Code.
Works with React Native and Capacitor projects. No external servers or build steps required.

## What it checks

| Platform | Policy | Auto-fix |
|----------|--------|----------|
| Android | 16 KB page size alignment (Android 15+) | Yes |
| Android | targetSdkVersion / compileSdkVersion ≥ 35 | Yes |
| Android | Android Gradle Plugin ≥ 8.5.1 | Yes |
| Android | Gradle wrapper ≥ 8.6 | Yes |
| Android | Capacitor SDK ↔ targetSdk compatibility | No (manual upgrade) |
| iOS | PrivacyInfo.xcprivacy exists | Yes |
| iOS | Required Reason APIs declared in privacy manifest | Yes |
| iOS | Minimum deployment target ≥ iOS 15.1 | Yes |
| iOS | Xcode ≥ 16.0 | Warning only |

---

## Installation

```bash
claude plugin install https://github.com/Shamique99x/rn-compliance-analyst
```

Or from a local clone:

```bash
git clone https://github.com/Shamique99x/rn-compliance-analyst
claude plugin install ./rn-compliance-analyst
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `/compliance-scan` | Scan + auto-fix all violations |
| `/compliance-scan android` | Android only |
| `/compliance-scan ios` | iOS only |
| `/compliance-scan --fix` | Scan and fix without confirmation prompt |
| `/inspect-apk` | Deep binary check on built APK (16 KB alignment per `.so`) |
| `/policies` | Show all active policy rules and current thresholds |
| `/status` | Quick pass/fail summary, no fix prompts |

---

## Typical workflow

```
# 1. Quick health check
/status

# 2. Full scan + fix
/compliance-scan

# 3. Verify the built APK (requires readelf/objdump)
/inspect-apk
```

---

## APK binary inspection

`/inspect-apk` requires `readelf` or `objdump` (part of `binutils`):

```bash
# macOS
brew install binutils

# Linux (Debian/Ubuntu)
apt-get install binutils
```

---

## Policy auto-updates

Thresholds are scraped from the official Android/iOS developer docs on the **1st of every month**
via GitHub Actions and committed to `policies/android.json` and `policies/ios.json` in this repo.

The skills read the installed policy files directly — always up to date after each `git pull` or reinstall.

---

## Project structure

```
rn-compliance-analyst/
├── .claude-plugin/
│   └── plugin.json               ← Plugin manifest
├── .github/workflows/
│   └── update-policies.yml       ← Monthly policy auto-update
├── commands/
│   ├── compliance-scan.md        ← /compliance-scan entry point
│   ├── inspect-apk.md            ← /inspect-apk entry point
│   ├── policies.md               ← /policies entry point
│   └── status.md                 ← /status entry point
├── hooks/
│   ├── hooks.json                ← PreToolUse hook config
│   └── validate-prerequisites.sh ← Checks readelf/objdump availability
├── policies/
│   ├── android.json              ← Android policy rules and thresholds
│   └── ios.json                  ← iOS policy rules and thresholds
├── scripts/
│   └── update-policies/          ← GitHub Actions policy updater
└── skills/
    ├── compliance-scan/SKILL.md  ← Full scan + fix logic
    ├── inspect-apk/SKILL.md      ← APK binary inspection logic
    ├── policies/SKILL.md         ← Policy reference display
    └── status/SKILL.md           ← Quick pass/fail check
```

---

## Adding new policies

1. Add a policy entry to `policies/android.json` or `policies/ios.json`
2. Add the corresponding check and fix logic to `skills/compliance-scan/SKILL.md`
3. Update the threshold table in `skills/policies/SKILL.md`

No build step, no server restart. Changes take effect immediately.

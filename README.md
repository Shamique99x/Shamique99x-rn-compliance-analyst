# React Native Compliance — Claude Code Plugin

Scan and auto-fix Android/iOS app store policy violations directly from Claude Code.
React Native projects only. No external servers, no build steps, no scheduled jobs.

## What it checks

| Platform | Policy | Severity | Auto-fix |
|----------|--------|----------|----------|
| Android | 16 KB page size alignment (Android 15+) | Error | Yes |
| Android | targetSdkVersion / compileSdkVersion ≥ 35 | Error | Yes |
| Android | Android Gradle Plugin ≥ 8.5.1 | Warning | Yes |
| Android | Gradle wrapper ≥ 8.6 | Warning | Yes |
| iOS | PrivacyInfo.xcprivacy exists | Error | Yes |
| iOS | Required Reason APIs declared in privacy manifest | Error | Yes |
| iOS | Minimum deployment target ≥ iOS 15.1 | Error | Yes |
| iOS | Xcode ≥ 16.0 | Warning | No |

---

## Installation

`claude plugin install` only works for marketplace plugins. For local/dev use, create a junction link:

```powershell
# Windows (PowerShell as admin)
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.claude\skills\rn-compliance-analyst" `
  -Target "C:\path\to\rn-compliance-analyst"
```

```bash
# macOS / Linux
ln -s /path/to/rn-compliance-analyst ~/.claude/skills/rn-compliance-analyst
```

Restart Claude Code after linking. The skills load automatically in all sessions.

---

## Commands

| Command | What it does |
|---------|-------------|
| `/compliance-scan` | Scan + auto-fix all violations, then raise a PR |
| `/compliance-scan android` | Android only |
| `/compliance-scan ios` | iOS only |
| `/inspect-apk` | Deep binary check on built APK (16 KB alignment per `.so`) |
| `/policies` | Show all active policy rules and current thresholds |
| `/status` | Quick pass/fail summary, no fixes applied |

---

## Full scan flow

`/compliance-scan` runs end-to-end without interruption:

1. **Pre-check** — if `.rn-compliance.json` missing, asks for PR config (base branch, reviewer, labels) then creates it
2. **Live policy fetch** — scrapes current thresholds from `developer.android.com` and `developer.apple.com`; falls back to local `policies/*.json` if unreachable
3. **Scan** — checks all Android and iOS policies
4. **Auto-fix** — applies all fixable violations immediately (no confirmation prompts)
5. **Library upgrades** — installs required `react-native` version if a failing policy needs it (e.g. `0.74.0` for 16 KB page size)
6. **Raise PR** — commits fixes to a `compliance/fix-YYYYMMDD` branch and opens a PR via `gh`

---

## Per-project config

`.rn-compliance.json` in your project root controls the PR target:

```json
{
  "pr": {
    "base_branch": "main",
    "reviewer": "github-username",
    "labels": ["compliance"]
  }
}
```

Created automatically on first scan if missing.

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

## Policy freshness

Thresholds are fetched live from official Android/iOS developer docs **on every scan invocation**.
No scheduled jobs, no manual updates needed.

Fallback chain: live scrape → `policies/android.json` / `policies/ios.json` → embedded thresholds.

---

## Project structure

```
rn-compliance-analyst/
├── .claude-plugin/
│   └── plugin.json               ← Plugin manifest
├── commands/
│   ├── compliance-scan.md        ← /compliance-scan entry point
│   ├── inspect-apk.md            ← /inspect-apk entry point
│   ├── policies.md               ← /policies entry point
│   └── status.md                 ← /status entry point
├── hooks/
│   ├── hooks.json                ← PreToolUse hook config
│   └── validate-prerequisites.sh ← Checks readelf/objdump availability
├── policies/
│   ├── android.json              ← Android policy rules and thresholds (fallback)
│   └── ios.json                  ← iOS policy rules and thresholds (fallback)
└── skills/
    ├── compliance-scan/SKILL.md  ← Full scan + fix + PR logic
    ├── inspect-apk/SKILL.md      ← APK binary inspection logic
    ├── policies/SKILL.md         ← Policy reference display
    └── status/SKILL.md           ← Quick pass/fail check
```

---

## Adding new policies

1. Add a policy entry to `policies/android.json` or `policies/ios.json`
2. Add check and fix logic to `skills/compliance-scan/SKILL.md`
3. Update the threshold table in `skills/policies/SKILL.md`

No build step, no server restart. Changes take effect immediately.

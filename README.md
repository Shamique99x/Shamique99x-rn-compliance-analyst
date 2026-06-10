# React Native Compliance — Claude Code Plugin

Scan and auto-fix Android/iOS App Store policy violations directly from Claude Code.

## What it checks

| Platform | Policy | Auto-fix |
|----------|--------|----------|
| Android | 16 KB page size alignment (Android 15+) | Yes |
| Android | targetSdkVersion / compileSdkVersion ≥ 35 | Yes |
| Android | Android Gradle Plugin ≥ 8.5.1 | Yes |
| Android | Gradle wrapper ≥ 8.6 | Yes |
| iOS | PrivacyInfo.xcprivacy exists | Yes |
| iOS | Required Reason APIs declared in privacy manifest | Yes |
| iOS | Minimum deployment target ≥ iOS 15.1 | Yes |
| iOS | Xcode ≥ 16.0 | Warning only |

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/Shamique99x/claude-rn-compliance
```

### 2. Install dependencies

```bash
cd claude-rn-compliance/mcp-server
npm install
```

The compiled `dist/` is already included — no build step needed.

### 3. Register with Claude Code

**Project-scoped** (recommended — only active inside one project):

```bash
cd /path/to/your-rn-project
claude mcp add --scope project rn-compliance node "/absolute/path/to/claude-rn-compliance/mcp-server/dist/index.js" --env POLICIES_DIR="/absolute/path/to/claude-rn-compliance/mcp-server/policies"
```

**Global** (active in all projects):

```bash
claude mcp add rn-compliance node "/absolute/path/to/claude-rn-compliance/mcp-server/dist/index.js" --env POLICIES_DIR="/absolute/path/to/claude-rn-compliance/mcp-server/policies"
```

### 4. Verify

Open a Claude Code chat inside your project and run:

```
/mcp
```

You should see `rn-compliance` listed as connected.

---

## Available tools

| Tool | Description |
|------|-------------|
| `compliance_scan` | Scan the project for Android/iOS policy violations |
| `compliance_fix` | Fix specific violations by ID (creates `.bak` backups) |
| `compliance_fix_all` | Scan + fix all auto-fixable violations in one shot |
| `compliance_upgrade_libraries` | Run npm/yarn/pnpm/bun to upgrade libraries to compliant versions |
| `compliance_inspect_apk` | Inspect a built APK — checks every `.so` for 16 KB page-alignment |
| `compliance_refresh_policies` | Pull latest policy thresholds from GitHub |
| `compliance_cache_status` | Check if the local policy cache is stale (>24h old) |
| `compliance_policy_info` | Show current policy versions, counts, and cache info |

### Optional: Install skills (slash commands)

Four skills are included for a guided conversational experience:

| Skill | Command | What it does |
|-------|---------|-------------|
| `compliance-scan` | `/compliance-scan` | Full scan → fix → APK inspection flow |
| `inspect-apk` | `/inspect-apk` | APK-only deep 16 KB check (offers to build if needed) |
| `policies` | `/policies` | Show loaded policy versions and cache status |
| `status` | `/status` | Quick pass/fail summary, no fix prompts |

**Install all skills — macOS/Linux:**
```bash
for skill in compliance-scan inspect-apk policies status; do
  mkdir -p ~/.claude/commands/$skill
  cp skills/$skill/SKILL.md ~/.claude/commands/$skill/SKILL.md
done
```

**Install all skills — Windows (PowerShell):**
```powershell
foreach ($skill in @("compliance-scan","inspect-apk","policies","status")) {
  New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\commands\$skill"
  Copy-Item "skills\$skill\SKILL.md" "$env:USERPROFILE\.claude\commands\$skill\SKILL.md"
}
```

---

## Typical workflow

```
# 1. Scan
compliance_scan projectPath="/path/to/my-rn-app"

# 2. Fix everything auto-fixable
compliance_fix_all projectPath="/path/to/my-rn-app"

# 3. Upgrade libraries that need it (after reviewing suggestions)
compliance_upgrade_libraries projectPath="/path/to/my-rn-app" upgrades=[...]

# 4. Verify the built APK
compliance_inspect_apk projectPath="/path/to/my-rn-app"
```

---

## Optional: AI-powered unknown library identification

When inspecting APKs, the plugin can identify unknown native libraries using AI.
Add one of the following in plugin settings (or as env vars):

| Key | Source | Cost |
|-----|--------|------|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Paid |
| `GEMINI_API_KEY` | aistudio.google.com | Free tier available |

If neither key is set, unrecognised libraries are flagged for manual review.

---

## Policy auto-updates

Policy thresholds are fetched from the official Android/iOS developer docs weekly via GitHub Actions and committed to this repo. The plugin pulls the latest from GitHub every 24 hours automatically.

To force a refresh:
```
compliance_refresh_policies
```

---

## Project structure

```
claude-rn-compliance/
├── .claude-plugin/
│   └── plugin.json               ← Plugin manifest
├── .mcp.json                     ← MCP server wiring
├── .github/workflows/
│   └── update-policies.yml       ← Weekly policy auto-update
├── skills/
│   ├── compliance-scan/SKILL.md  ← /compliance-scan skill (scan + fix + APK)
│   ├── inspect-apk/SKILL.md      ← /inspect-apk skill (APK-only deep check)
│   ├── policies/SKILL.md         ← /policies skill (show loaded policy versions)
│   └── status/SKILL.md           ← /status skill (quick pass/fail summary)
├── mcp-server/
│   ├── dist/                     ← Compiled JS (committed)
│   ├── src/
│   │   ├── index.ts              ← MCP server entry point
│   │   ├── engine/               ← JSON-driven policy engine
│   │   │   ├── check-runner.ts   ← interprets policy `check` field at runtime
│   │   │   └── fix-runner.ts     ← interprets policy `fix` field at runtime
│   │   ├── tools/                ← scan, fix, upgrade, inspect-apk, policy-info
│   │   ├── scanners/             ← custom scanners (APK ELF, privacy manifest source scan)
│   │   ├── fixers/               ← custom fixers (privacy manifest creation/injection)
│   │   └── policies/             ← cache / loader / fetcher
│   └── policies/
│       ├── android.json          ← Android policy rules
│       ├── ios.json              ← iOS policy rules
│       └── native-lib-map.json   ← Known native library → npm package map
└── scripts/
    └── update-policies/          ← GitHub Actions policy updater script
```

## Adding new policies

The plugin uses a JSON-driven policy engine — for any policy whose `check` and `fix`
types are already supported by the engine, **no code changes are needed**. Just update
the JSON.

### Standard policy (JSON only)

1. Add the policy entry to `mcp-server/policies/android.json` or `ios.json`, including
   `check` and `fix` fields using the supported types below
2. Run `npm run build` inside `mcp-server/` and commit `dist/`

That's it. The engine picks up the new policy automatically on the next scan.

**Supported `check` types:** `composite`, `file_exists`, `file_contains`,
`gradle_int_property`, `gradle_cmake_arg`, `gradle_classpath_version`,
`properties_version`, `podfile_platform_version`, `pbxproj_property`,
`xcode_version_file`, `package_json_min_version`

**Supported `fix` types:** `composite`, `properties_set`, `gradle_cmake_arg_append`,
`cmake_linker_flag`, `gradle_int_property_set`, `gradle_classpath_version_set`,
`create_file`, `privacy_manifest_append_apis`, `podfile_platform_set`,
`pbxproj_property_set`

### Custom policy (requires code)

Only needed if the check or fix logic cannot be expressed with the types above
(e.g. source-code pattern scanning like the privacy manifest required-reason check):

1. Add the policy entry to the relevant JSON file
2. Add a scanner in `src/scanners/<platform>/` and call it from `src/tools/scan.ts`
3. Add a fixer in `src/fixers/<platform>/` (if auto-fixable) and call it from `src/tools/fix.ts`
4. Run `npm run build` inside `mcp-server/` and commit `dist/`

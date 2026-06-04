# claude-rn-compliance

A Claude Code plugin that automatically detects and fixes Android/iOS app store policy violations in React Native projects.

## What it checks

| Platform | Policy | Auto-fix |
|----------|--------|----------|
| Android | 16 KB page size alignment (Android 15 / Pixel 8+) | Yes |
| Android | targetSdkVersion / compileSdkVersion >= 35 | Yes |
| Android | Android Gradle Plugin >= 8.3 | Yes |
| Android | Gradle wrapper >= 8.6 | Yes |
| iOS | PrivacyInfo.xcprivacy exists | Yes |
| iOS | Required Reason APIs declared in privacy manifest | Yes |
| iOS | Minimum deployment target >= iOS 15.1 | Yes |
| iOS | Xcode >= 16.0 | Warning only |

---

## Installation

### 1. Install the MCP server

```bash
cd mcp-server
npm install
npm run build
```

### 2. Register the MCP server with Claude Code

Add to your project's `.claude/settings.json` (or `~/.claude/settings.json` for global use):

```json
{
  "mcpServers": {
    "claude-rn-compliance": {
      "command": "node",
      "args": ["/absolute/path/to/claude-rn-compliance/mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Install the slash command

Copy `skill/compliance-scan.md` to your Claude Code commands directory. This makes `/compliance-scan` available globally in both the VS Code extension and the CLI.

```bash
# macOS/Linux
mkdir -p ~/.claude/commands
cp skill/compliance-scan.md ~/.claude/commands/compliance-scan.md

# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\commands"
Copy-Item skill\compliance-scan.md "$env:USERPROFILE\.claude\commands\compliance-scan.md"
```

For project-scoped installation (only available inside one project), copy to `.claude/commands/compliance-scan.md` in the RN project root instead.

---

## Usage

Inside Claude Code, run:

```
/compliance-scan              # Scan both Android and iOS
/compliance-scan android      # Android only
/compliance-scan ios          # iOS only
/compliance-scan --refresh    # Fetch latest policies, then scan
```

### Example session

```
> /compliance-scan

⚠️  Library upgrades required

  • react-native  0.73.1 → 0.74.0+
    Reason: First RN version with 16 KB-compatible Hermes
    Required by: 16 KB Page Size Alignment

[ERROR] 16 KB Page Size Alignment
  Android 15 requires all native .so libraries aligned to 16 KB pages.
  Details: android.bundle.enableUncompressedNativeLibs=true missing; cmake arg missing
  Files: android/gradle.properties, android/app/build.gradle
  Docs: https://developer.android.com/guide/practices/page-sizes
  Auto-fixable: Yes

[ERROR] Target & Compile SDK Version
  targetSdkVersion is 33, must be >= 35
  Files: android/app/build.gradle
  Auto-fixable: Yes

[ERROR] Privacy Manifest File (PrivacyInfo.xcprivacy)
  ios/PrivacyInfo.xcprivacy does not exist.
  Files: ios/PrivacyInfo.xcprivacy
  Auto-fixable: Yes

Found 3 violation(s): 3 error(s). All 3 are auto-fixable.

Proceed with automatic fixes? [y/N]

> y

Fixes applied:

  android/gradle.properties
    + Added android.bundle.enableUncompressedNativeLibs=true

  android/app/build.gradle
    + Bumped compileSdkVersion and targetSdkVersion to 35
    + Added -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON to cmake arguments

  ios/PrivacyInfo.xcprivacy
    + Created PrivacyInfo.xcprivacy with default template
    + Added NSPrivacyAccessedAPITypes for UserDefaults (AsyncStorage usage detected)

Backup files created with .bak extension alongside each modified file.
```

---

## Policy updates

Policy definitions ship bundled with the plugin. They auto-refresh from the remote source every 24 hours when online.

To force a refresh:
```
/compliance-scan --refresh
```

---

## Running tests

```bash
cd mcp-server
npm test
```

---

## Project structure

```
claude-rn-compliance/
├── skill/
│   └── compliance-scan.md        ← Claude Code /compliance-scan skill
├── mcp-server/
│   ├── src/
│   │   ├── index.ts              ← MCP server entry
│   │   ├── tools/                ← scan, fix, refresh tools
│   │   ├── scanners/             ← per-policy violation detectors
│   │   ├── fixers/               ← per-policy auto-fixers
│   │   └── policies/             ← cache/loader/fetcher
│   ├── policies/
│   │   ├── android.json          ← bundled Android policy rules
│   │   └── ios.json              ← bundled iOS policy rules
│   └── tests/
│       ├── fixtures/             ← sample non-compliant project files
│       └── scanners.test.ts      ← scanner unit tests
└── README.md
```

## Adding new policies

1. Add the policy entry to `mcp-server/policies/android.json` or `ios.json`
2. Create a scanner in `src/scanners/<platform>/`
3. Create a fixer in `src/fixers/<platform>/` (if auto-fixable)
4. Register the fixer in `src/tools/fix.ts` `FIXER_MAP`
5. Add a test case in `tests/scanners.test.ts`

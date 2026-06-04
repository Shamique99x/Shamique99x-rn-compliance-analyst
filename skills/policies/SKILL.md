---
name: policies
description: Show loaded policy versions, cache age, and a summary of all rules currently enforced. Use when the user wants to know what policy versions are active or when policies were last refreshed.
---

# policies — Policy Database Info

Show what policy rules are loaded, where they came from, and when they were last updated.

## Steps

### 1. Fetch policy info

Call `compliance_policy_info` with no arguments.

### 2. Display

```
React Native Compliance — Policy Database

Android  (<version>)
  Source:    <"Remote cache" | "Bundled (run --refresh to fetch latest)">
  Updated:   <fetched_at formatted as "2 hours ago" | "3 days ago" | "never">
  Policies:  <policy_count> rules enforced

  <id>  [ERROR|WARN]  <name>
  ...

iOS  (<version>)
  Source:    <"Remote cache" | "Bundled">
  Updated:   <fetched_at>
  Policies:  <policy_count> rules enforced

  <id>  [ERROR|WARN]  <name>
  ...

Native Library Map  (<version>)
  Entries:   <mapping_count> known packages
  Coverage:  Static map + Claude AI fallback for unknown libraries
```

### 3. Cache freshness hint

If any platform shows `source: "bundled"` (never refreshed):
> 💡 Run `/rn-compliance:compliance-scan --refresh` to fetch the latest policies from the official sources.

If any platform shows `stale: true` (cache >24h old):
> ⚠️ Policy cache is more than 24 hours old. Run `/rn-compliance:compliance-scan --refresh` to update.

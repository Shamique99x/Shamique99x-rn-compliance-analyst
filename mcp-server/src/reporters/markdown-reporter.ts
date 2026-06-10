/**
 * Markdown Reporter
 *
 * Formats scan and fix results as readable Markdown for display in
 * MCP chat responses or documentation.
 */

import { ScanResult, FixAllResult, Violation, Severity } from "../types";

const SEVERITY_ICON: Record<Severity, string> = {
  error:   "🔴",
  warning: "🟡",
  info:    "🔵",
};

export function formatScanAsMarkdown(result: ScanResult): string {
  const { violations, library_upgrades_required: upgrades } = result;
  const lines: string[] = [];

  lines.push(`## Compliance Scan Results`);
  lines.push(`- **Project type:** ${result.project_type}`);
  lines.push(`- **Policies version:** ${result.policies_version}`);
  lines.push(`- **Scan time:** ${result.scan_time}`);
  lines.push("");

  if (violations.length === 0) {
    lines.push("✅ **No violations found.**");
  } else {
    const fixable = violations.filter((v) => v.auto_fixable).length;
    lines.push(
      `### Violations (${violations.length} total, ${fixable} auto-fixable)`
    );
    lines.push("");

    for (const v of violations) {
      lines.push(formatViolation(v));
    }
  }

  if (upgrades.length > 0) {
    lines.push("");
    lines.push(`### Library Upgrades Required (${upgrades.length})`);
    lines.push("");
    for (const u of upgrades) {
      lines.push(
        `- **${u.name}** — upgrade from \`${u.current_version}\` to \`${u.min_version}\``
      );
      lines.push(`  ${u.reason}`);
    }
  }

  if (result.apk_inspection) {
    lines.push("");
    lines.push(`### APK Native Library Inspection`);
    const apk = result.apk_inspection;
    if (apk.error) {
      lines.push(`⚠️ ${apk.error}`);
    } else if (apk.compliant) {
      lines.push(`✅ All ${apk.libraries_checked} native libraries are 16 KB page-size compliant.`);
    } else {
      lines.push(
        `❌ ${apk.non_compliant.length} of ${apk.libraries_checked} libraries are non-compliant.`
      );
      for (const lib of apk.non_compliant) {
        lines.push(`  - \`${lib.name}\` (${lib.abi}): ${lib.issues.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatFixAsMarkdown(result: FixAllResult): string {
  const lines: string[] = [];
  lines.push(`## Fix Results`);
  lines.push("");

  if (result.applied.length === 0 && result.skipped.length === 0) {
    lines.push("Nothing to fix.");
    return lines.join("\n");
  }

  if (result.applied.length > 0) {
    const succeeded = result.applied.filter((r) => r.success).length;
    lines.push(`### Applied (${succeeded}/${result.applied.length} succeeded)`);
    lines.push("");
    for (const fix of result.applied) {
      const icon = fix.success ? "✅" : "❌";
      lines.push(`${icon} **${fix.violation_id}**`);
      if (fix.error) lines.push(`  - Error: ${fix.error}`);
      for (const change of fix.changes) {
        lines.push(`  - \`${change.file}\`: ${change.description}`);
        if (change.backup_path) {
          lines.push(`    Backup: \`${change.backup_path}\``);
        }
      }
    }
  }

  if (result.skipped.length > 0) {
    lines.push("");
    lines.push(`### Skipped (no fixer available)`);
    for (const id of result.skipped) {
      lines.push(`- \`${id}\``);
    }
  }

  return lines.join("\n");
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function formatViolation(v: Violation): string {
  const icon = SEVERITY_ICON[v.severity];
  const fix  = v.auto_fixable ? " *(auto-fixable)*" : "";
  const lines = [
    `#### ${icon} \`${v.policy_id}\`${fix}`,
    `**${v.policy_name}** (${v.platform})`,
    `> ${v.details}`,
  ];
  if (v.affected_files.length > 0) {
    lines.push(`Affected files: ${v.affected_files.map((f) => `\`${f}\``).join(", ")}`);
  }
  if (v.docs_url) {
    lines.push(`[Documentation](${v.docs_url})`);
  }
  lines.push("");
  return lines.join("\n");
}

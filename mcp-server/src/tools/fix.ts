import * as path from "path";
import { FixResult, FixAllResult } from "../types";
import { complianceScan }          from "./scan";
import { loadPolicies }            from "../policies/loader";
import { runFix }                  from "../engine/fix-runner";

/**
 * Apply fixes for a given list of violation IDs.
 *
 * The engine reads the `fix` field from the policy JSON at runtime, so adding a
 * new policy to the JSON (or refreshing from the remote cache) automatically
 * makes it fixable — no code changes needed.
 *
 * Special cases retained:
 *   ios-privacy-* violations are de-duplicated: running fixPrivacyManifest once
 *   covers both "file exists" and "required reason APIs" policies.  The engine's
 *   `privacy_manifest_append_apis` fix type delegates to the same fixer, so the
 *   de-duplication guard below prevents writing the manifest twice in fix-all mode.
 */
export async function complianceFix(
  projectPath: string,
  violationIds: string[]
): Promise<FixAllResult> {
  const absPath = path.resolve(projectPath);
  const applied: FixResult[] = [];
  const skipped: string[] = [];

  // Merge all platform policy DBs into one lookup map  id → fix
  const policyMap = buildPolicyMap();

  // De-duplication: some violations share a fixer group (privacy manifest).
  // Track which "fixer group" keys have already been executed.
  const seenFixerGroups = new Set<string>();

  for (const id of violationIds) {
    const policy = policyMap.get(id);
    if (!policy || !policy.fix) {
      skipped.push(id);
      continue;
    }

    // Group key: ios-privacy-* share a single fixer run
    const groupKey = FIXER_GROUP[id] ?? id;
    if (seenFixerGroups.has(groupKey)) continue;
    seenFixerGroups.add(groupKey);

    const result = await runFix(absPath, id, policy.fix);
    applied.push(result);
  }

  const allBackups = applied.flatMap((r) => r.changes.map((c) => c.backup_path).filter(Boolean));
  return { applied, skipped, backup_paths: allBackups };
}

export async function complianceFixAll(projectPath: string): Promise<FixAllResult> {
  const scan       = await complianceScan(projectPath);
  const fixableIds = scan.violations
    .filter((v) => v.auto_fixable)
    .map((v) => v.policy_id);

  return complianceFix(projectPath, fixableIds);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Both ios-privacy-* policies trigger `fixPrivacyManifest`, which handles both
 * file creation and API-entry injection in a single pass.
 * Running it twice would write the manifest file twice (needlessly).
 */
const FIXER_GROUP: Record<string, string> = {
  "ios-privacy-manifest-exists":        "ios-privacy-fixer",
  "ios-privacy-required-reason-apis":   "ios-privacy-fixer",
};

function buildPolicyMap() {
  const map = new Map<string, { fix: import("../types").PolicyFix | null }>();
  for (const platform of (["android", "ios"] as const)) {
    const db = loadPolicies(platform);
    for (const policy of db.policies) {
      map.set(policy.id, { fix: policy.fix });
    }
  }
  return map;
}

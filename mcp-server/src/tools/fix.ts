import * as path from "path";
import { FixResult, FixAllResult } from "../types";
import { complianceScan } from "./scan";
import { fixPageSize } from "../fixers/android/page-size-fixer";
import { fixSdkVersions } from "../fixers/android/sdk-version-fixer";
import { fixPrivacyManifest } from "../fixers/ios/privacy-manifest-fixer";
import { fixDeploymentTarget } from "../fixers/ios/deployment-target-fixer";

// Violations that must share a single fixer run are grouped under the same key.
// This prevents the same file being written twice for ios-privacy-* violations.
const FIXER_GROUP: Record<string, string> = {
  "ios-privacy-manifest-exists": "ios-privacy-fixer",
  "ios-privacy-required-reason-apis": "ios-privacy-fixer",
};

// SDK violations are handled as a trio — all three fixers are idempotent and
// the results are indexed by stable position, so we run them together.
const SDK_VIOLATION_IDS = new Set([
  "android-target-sdk",
  "android-agp-version",
  "android-gradle-wrapper",
]);

const SINGLE_FIXER_MAP: Record<
  string,
  (projectPath: string) => FixResult | Promise<FixResult>
> = {
  "android-16kb-page-size": fixPageSize,
  "ios-privacy-manifest-exists": fixPrivacyManifest,
  "ios-privacy-required-reason-apis": fixPrivacyManifest,
  "ios-min-deployment-target": fixDeploymentTarget,
};

export async function complianceFix(
  projectPath: string,
  violationIds: string[]
): Promise<FixAllResult> {
  const absPath = path.resolve(projectPath);
  const applied: FixResult[] = [];
  const skipped: string[] = [];
  const seenGroups = new Set<string>();

  // Run SDK fixers once if any SDK violation is in the list
  const hasSdkViolation = violationIds.some((id) => SDK_VIOLATION_IDS.has(id));
  if (hasSdkViolation) {
    seenGroups.add("sdk-fixer");
    try {
      // fixSdkVersions returns exactly [targetSdk, agp, wrapper] — stable order, no filtering
      const sdkResults = fixSdkVersions(absPath);
      // Only push results that have actual changes (keeps the report clean)
      applied.push(...sdkResults.filter((r) => r.changes.length > 0 || !r.success));
    } catch (err) {
      applied.push({
        violation_id: "android-target-sdk",
        success: false,
        changes: [],
        error: (err as Error).message,
      });
    }
  }

  for (const id of violationIds) {
    if (SDK_VIOLATION_IDS.has(id)) continue; // already handled above

    const fixer = SINGLE_FIXER_MAP[id];
    if (!fixer) {
      skipped.push(id);
      continue;
    }

    // Use explicit group key to avoid running the same fixer twice
    const groupKey = FIXER_GROUP[id] ?? id;
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);

    try {
      const result = await Promise.resolve(fixer(absPath));
      applied.push(result);
    } catch (err) {
      applied.push({
        violation_id: id,
        success: false,
        changes: [],
        error: (err as Error).message,
      });
    }
  }

  const allBackups = applied.flatMap((r) => r.changes.map((c) => c.backup_path).filter(Boolean));
  return { applied, skipped, backup_paths: allBackups };
}

export async function complianceFixAll(projectPath: string): Promise<FixAllResult> {
  const scan = await complianceScan(projectPath);
  const fixableIds = scan.violations
    .filter((v) => v.auto_fixable)
    .map((v) => v.policy_id);

  return complianceFix(projectPath, fixableIds);
}

import { FixAllResult } from "../types";
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
export declare function complianceFix(projectPath: string, violationIds: string[]): Promise<FixAllResult>;
//# sourceMappingURL=fix.d.ts.map
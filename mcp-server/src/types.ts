export type Platform = "android" | "ios";
export type Severity = "error" | "warning" | "info";

export interface PolicyCheck {
  type: string;
  [key: string]: unknown;
}

export interface PolicyFix {
  type: string;
  [key: string]: unknown;
}

export interface LibraryRequirement {
  name: string;
  min_version: string;
  reason: string;
}

export interface Policy {
  id: string;
  name: string;
  platform: Platform;
  severity: Severity;
  auto_fixable: boolean;
  description: string;
  docs_url: string;
  check: PolicyCheck;
  fix: PolicyFix | null;
  library_requirements: LibraryRequirement[];
}

export interface PolicyDatabase {
  version: string;
  platform: Platform;
  policies: Policy[];
}

export interface Violation {
  policy_id: string;
  policy_name: string;
  platform: Platform;
  severity: Severity;
  auto_fixable: boolean;
  description: string;
  docs_url: string;
  details: string;
  affected_files: string[];
}

export interface LibUpgrade {
  name: string;
  current_version: string;
  min_version: string;
  reason: string;
  required_by_policy_ids: string[];
}

export interface NativeLibraryResult {
  name: string;
  abi: string;
  compressed: boolean;
  load_alignment: number | null;
  compliant: boolean;
  issues: string[];
}

export interface ApkInspectionResult {
  apk_path: string;
  libraries_checked: number;
  non_compliant: NativeLibraryResult[];
  compliant: boolean;
  /** True when the APK is older than one or more build config files.
   *  ELF results are still shown but should not be trusted until rebuilt. */
  stale?: boolean;
  /** Which build file is newer than the APK, e.g. "android/app/build.gradle" */
  stale_reason?: string;
  error?: string;
}

export interface ScanResult {
  violations: Violation[];
  library_upgrades_required: LibUpgrade[];
  scan_time: string;
  policies_version: string;
  /** Present when a built APK was found and inspected for native library compliance. */
  apk_inspection?: ApkInspectionResult;
}

export interface FixChange {
  file: string;
  description: string;
  backup_path: string;
}

export interface FixResult {
  violation_id: string;
  success: boolean;
  changes: FixChange[];
  error?: string;
}

export interface FixAllResult {
  applied: FixResult[];
  skipped: string[];
  backup_paths: string[];
}

export interface PolicyRefreshResult {
  updated: boolean;
  version: string;
  changelog: string[];
}

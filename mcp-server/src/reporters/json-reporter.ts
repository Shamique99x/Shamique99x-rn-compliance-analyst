/**
 * JSON Reporter
 *
 * Formats scan and fix results as clean JSON objects suitable for MCP
 * tool responses. Provides consistent structure and summary fields.
 */

import { ScanResult, FixAllResult, Violation } from "../types";

export interface JsonScanReport {
  summary: {
    total_violations: number;
    errors: number;
    warnings: number;
    infos: number;
    auto_fixable: number;
    library_upgrades_required: number;
    project_type: string;
    policies_version: string;
    scan_time: string;
  };
  violations: Violation[];
  library_upgrades_required: ScanResult["library_upgrades_required"];
  apk_inspection?: ScanResult["apk_inspection"];
}

export interface JsonFixReport {
  summary: {
    total_applied: number;
    total_skipped: number;
    total_backup_files: number;
    all_succeeded: boolean;
  };
  applied: FixAllResult["applied"];
  skipped: FixAllResult["skipped"];
  backup_paths: string[];
}

export function formatScanAsJson(result: ScanResult): JsonScanReport {
  const { violations } = result;
  return {
    summary: {
      total_violations: violations.length,
      errors:   violations.filter((v) => v.severity === "error").length,
      warnings: violations.filter((v) => v.severity === "warning").length,
      infos:    violations.filter((v) => v.severity === "info").length,
      auto_fixable: violations.filter((v) => v.auto_fixable).length,
      library_upgrades_required: result.library_upgrades_required.length,
      project_type:      result.project_type,
      policies_version:  result.policies_version,
      scan_time:         result.scan_time,
    },
    violations,
    library_upgrades_required: result.library_upgrades_required,
    apk_inspection: result.apk_inspection,
  };
}

export function formatFixAsJson(result: FixAllResult): JsonFixReport {
  return {
    summary: {
      total_applied:       result.applied.length,
      total_skipped:       result.skipped.length,
      total_backup_files:  result.backup_paths.length,
      all_succeeded:       result.applied.every((r) => r.success),
    },
    applied:      result.applied,
    skipped:      result.skipped,
    backup_paths: result.backup_paths,
  };
}

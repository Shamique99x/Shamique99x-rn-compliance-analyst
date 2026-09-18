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
export declare function formatScanAsJson(result: ScanResult): JsonScanReport;
export declare function formatFixAsJson(result: FixAllResult): JsonFixReport;
//# sourceMappingURL=json-reporter.d.ts.map
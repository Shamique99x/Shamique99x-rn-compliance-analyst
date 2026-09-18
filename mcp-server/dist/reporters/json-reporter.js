"use strict";
/**
 * JSON Reporter
 *
 * Formats scan and fix results as clean JSON objects suitable for MCP
 * tool responses. Provides consistent structure and summary fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatScanAsJson = formatScanAsJson;
exports.formatFixAsJson = formatFixAsJson;
function formatScanAsJson(result) {
    const { violations } = result;
    return {
        summary: {
            total_violations: violations.length,
            errors: violations.filter((v) => v.severity === "error").length,
            warnings: violations.filter((v) => v.severity === "warning").length,
            infos: violations.filter((v) => v.severity === "info").length,
            auto_fixable: violations.filter((v) => v.auto_fixable).length,
            library_upgrades_required: result.library_upgrades_required.length,
            project_type: result.project_type,
            policies_version: result.policies_version,
            scan_time: result.scan_time,
        },
        violations,
        library_upgrades_required: result.library_upgrades_required,
        apk_inspection: result.apk_inspection,
    };
}
function formatFixAsJson(result) {
    return {
        summary: {
            total_applied: result.applied.length,
            total_skipped: result.skipped.length,
            total_backup_files: result.backup_paths.length,
            all_succeeded: result.applied.every((r) => r.success),
        },
        applied: result.applied,
        skipped: result.skipped,
        backup_paths: result.backup_paths,
    };
}
//# sourceMappingURL=json-reporter.js.map
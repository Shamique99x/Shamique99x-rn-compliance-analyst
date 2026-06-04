"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceFix = complianceFix;
exports.complianceFixAll = complianceFixAll;
const path = __importStar(require("path"));
const scan_1 = require("./scan");
const page_size_fixer_1 = require("../fixers/android/page-size-fixer");
const sdk_version_fixer_1 = require("../fixers/android/sdk-version-fixer");
const privacy_manifest_fixer_1 = require("../fixers/ios/privacy-manifest-fixer");
const deployment_target_fixer_1 = require("../fixers/ios/deployment-target-fixer");
// Violations that must share a single fixer run are grouped under the same key.
// This prevents the same file being written twice for ios-privacy-* violations.
const FIXER_GROUP = {
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
const SINGLE_FIXER_MAP = {
    "android-16kb-page-size": page_size_fixer_1.fixPageSize,
    "ios-privacy-manifest-exists": privacy_manifest_fixer_1.fixPrivacyManifest,
    "ios-privacy-required-reason-apis": privacy_manifest_fixer_1.fixPrivacyManifest,
    "ios-min-deployment-target": deployment_target_fixer_1.fixDeploymentTarget,
};
async function complianceFix(projectPath, violationIds) {
    const absPath = path.resolve(projectPath);
    const applied = [];
    const skipped = [];
    const seenGroups = new Set();
    // Run SDK fixers once if any SDK violation is in the list
    const hasSdkViolation = violationIds.some((id) => SDK_VIOLATION_IDS.has(id));
    if (hasSdkViolation) {
        seenGroups.add("sdk-fixer");
        try {
            // fixSdkVersions returns exactly [targetSdk, agp, wrapper] — stable order, no filtering
            const sdkResults = (0, sdk_version_fixer_1.fixSdkVersions)(absPath);
            // Only push results that have actual changes (keeps the report clean)
            applied.push(...sdkResults.filter((r) => r.changes.length > 0 || !r.success));
        }
        catch (err) {
            applied.push({
                violation_id: "android-target-sdk",
                success: false,
                changes: [],
                error: err.message,
            });
        }
    }
    for (const id of violationIds) {
        if (SDK_VIOLATION_IDS.has(id))
            continue; // already handled above
        const fixer = SINGLE_FIXER_MAP[id];
        if (!fixer) {
            skipped.push(id);
            continue;
        }
        // Use explicit group key to avoid running the same fixer twice
        const groupKey = FIXER_GROUP[id] ?? id;
        if (seenGroups.has(groupKey))
            continue;
        seenGroups.add(groupKey);
        try {
            const result = await Promise.resolve(fixer(absPath));
            applied.push(result);
        }
        catch (err) {
            applied.push({
                violation_id: id,
                success: false,
                changes: [],
                error: err.message,
            });
        }
    }
    const allBackups = applied.flatMap((r) => r.changes.map((c) => c.backup_path).filter(Boolean));
    return { applied, skipped, backup_paths: allBackups };
}
async function complianceFixAll(projectPath) {
    const scan = await (0, scan_1.complianceScan)(projectPath);
    const fixableIds = scan.violations
        .filter((v) => v.auto_fixable)
        .map((v) => v.policy_id);
    return complianceFix(projectPath, fixableIds);
}
//# sourceMappingURL=fix.js.map
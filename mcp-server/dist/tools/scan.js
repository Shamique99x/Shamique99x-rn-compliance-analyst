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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceScan = complianceScan;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const semver_1 = __importDefault(require("semver"));
const loader_1 = require("../policies/loader");
const page_size_1 = require("../scanners/android/page-size");
const sdk_versions_1 = require("../scanners/android/sdk-versions");
const privacy_manifest_1 = require("../scanners/ios/privacy-manifest");
const deployment_target_1 = require("../scanners/ios/deployment-target");
const apk_inspector_1 = require("../scanners/android/apk-inspector");
const lib_mapper_1 = require("../scanners/android/lib-mapper");
async function complianceScan(projectPath, platforms = ["android", "ios"]) {
    const absPath = path.resolve(projectPath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`Project path not found: ${absPath}`);
    }
    const violations = [];
    if (platforms.includes("android")) {
        violations.push(...(0, page_size_1.scanPageSize)(absPath));
        violations.push(...(0, sdk_versions_1.scanSdkVersions)(absPath));
    }
    if (platforms.includes("ios")) {
        violations.push(...(await (0, privacy_manifest_1.scanPrivacyManifest)(absPath)));
        violations.push(...(await (0, deployment_target_1.scanDeploymentTarget)(absPath)));
    }
    const libraryUpgrades = collectLibraryUpgrades(absPath, violations, platforms);
    // Report the version of the first requested platform's policy DB
    const policiesVersion = (0, loader_1.loadPolicies)(platforms[0] ?? "android").version;
    // APK-level 16 KB inspection — runs only when a built APK exists.
    // This catches misaligned third-party .so files that build-config checks miss.
    let apk_inspection;
    if (platforms.includes("android")) {
        const apkPath = (0, apk_inspector_1.findApk)(absPath);
        if (apkPath) {
            apk_inspection = (0, apk_inspector_1.inspectApk)(apkPath);
            // Promote APK non-compliance to violations so it surfaces in the normal report
            if (!apk_inspection.compliant && !apk_inspection.error) {
                const byLibrary = apk_inspection.non_compliant
                    .map((lib) => `  • ${lib.abi}/${lib.name}\n${lib.issues.map((i) => `      – ${i}`).join("\n")}`)
                    .join("\n");
                violations.push({
                    policy_id: "android-16kb-apk-verified",
                    policy_name: "16 KB Page Size — APK Verification",
                    platform: "android",
                    severity: "error",
                    auto_fixable: false,
                    description: "One or more native libraries in the built APK are not 16 KB page-size " +
                        "compliant. This will cause crashes on Android 15+ devices with 16 KB pages. " +
                        "Build-config fixes alone are not enough — the offending libraries must be " +
                        "recompiled or updated to a version that ships with 16 KB-aligned binaries.",
                    docs_url: "https://developer.android.com/guide/practices/page-sizes",
                    details: `APK inspected: ${apkPath}\n` +
                        `Libraries checked: ${apk_inspection.libraries_checked}\n` +
                        `Non-compliant (${apk_inspection.non_compliant.length}):\n${byLibrary}`,
                    affected_files: apk_inspection.non_compliant.map((lib) => `lib/${lib.abi}/${lib.name}`),
                });
                // Resolve which npm packages need upgrading and merge into libraryUpgrades
                const apkUpgrades = await (0, lib_mapper_1.resolveUpgrades)(apk_inspection.non_compliant, absPath);
                for (const upgrade of apkUpgrades) {
                    // Don't duplicate if the package is already flagged by a build-config check
                    if (!libraryUpgrades.some((u) => u.name === upgrade.name)) {
                        libraryUpgrades.push(upgrade);
                    }
                }
            }
        }
    }
    return {
        violations,
        library_upgrades_required: libraryUpgrades,
        scan_time: new Date().toISOString(),
        policies_version: policiesVersion,
        apk_inspection,
    };
}
function collectLibraryUpgrades(projectPath, violations, platforms) {
    const pkgFile = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgFile))
        return [];
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const upgradeMap = new Map();
    for (const platform of platforms) {
        const db = (0, loader_1.loadPolicies)(platform);
        for (const policy of db.policies) {
            const hasViolation = violations.some((v) => v.policy_id === policy.id);
            if (!hasViolation)
                continue;
            for (const req of policy.library_requirements) {
                const current = allDeps[req.name]?.replace(/^[\^~>=<]/, "");
                if (!current)
                    continue;
                const coerced = semver_1.default.coerce(current);
                if (coerced && semver_1.default.lt(coerced, req.min_version)) {
                    const existing = upgradeMap.get(req.name);
                    if (existing) {
                        if (!existing.required_by_policy_ids.includes(policy.id)) {
                            existing.required_by_policy_ids.push(policy.id);
                        }
                    }
                    else {
                        upgradeMap.set(req.name, {
                            name: req.name,
                            current_version: current,
                            min_version: req.min_version,
                            reason: req.reason,
                            required_by_policy_ids: [policy.id],
                        });
                    }
                }
            }
        }
    }
    return [...upgradeMap.values()];
}
//# sourceMappingURL=scan.js.map
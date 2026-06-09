"use strict";
/**
 * JSON-driven policy check engine.
 *
 * Interprets the `check` field of a Policy object and evaluates it against the
 * project on disk.  No hardcoded scanner logic — everything comes from the JSON,
 * so new policies pushed to the remote cache work immediately after
 * `compliance_refresh_policies` without any code changes.
 *
 * Supported check types
 * ─────────────────────
 *   composite               Run multiple sub-checks; fail if any fail
 *   file_exists             Required file must be present
 *   file_contains           .properties-style key=value must be set correctly
 *   gradle_int_property     Integer property must meet minimum value
 *   gradle_cmake_arg        Specific cmake argument must be present in build.gradle
 *   gradle_classpath_version  Classpath dependency must meet minimum version
 *   properties_version      Version extracted via regex must meet minimum
 *   podfile_platform_version  iOS Podfile platform version must meet minimum
 *   pbxproj_property        Xcode project property must meet minimum version
 *   xcode_version_file      .xcode-version file must meet minimum version
 *   package_json_min_version  npm package in package.json must meet minimum version
 *   privacy_required_reason_apis  (complex — deferred to custom scanner in scan.ts)
 */
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
exports.runCheck = runCheck;
exports.findPbxproj = findPbxproj;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver_1 = __importDefault(require("semver"));
// ── Entry point ───────────────────────────────────────────────────────────────
function runCheck(projectPath, check) {
    switch (check.type) {
        case "composite":
            return runCompositeCheck(projectPath, check);
        case "file_exists":
            return checkFileExists(projectPath, check);
        case "file_contains":
            return checkFileContains(projectPath, check);
        case "gradle_int_property":
            return checkGradleIntProperty(projectPath, check);
        case "gradle_cmake_arg":
            return checkGradleCmakeArg(projectPath, check);
        case "gradle_classpath_version":
            return checkGradleClasspathVersion(projectPath, check);
        case "properties_version":
            return checkPropertiesVersion(projectPath, check);
        case "podfile_platform_version":
            return checkPodfilePlatformVersion(projectPath, check);
        case "pbxproj_property":
            return checkPbxprojProperty(projectPath, check);
        case "xcode_version_file":
            return checkXcodeVersionFile(projectPath, check);
        case "package_json_min_version":
            return checkPackageJsonMinVersion(projectPath, check);
        case "privacy_required_reason_apis":
            // Handled by the custom privacy-manifest scanner — engine defers
            return { passed: true, details: "", affected_files: [] };
        default:
            // Unknown type: skip rather than false-positive
            return { passed: true, details: `Unknown check type '${check.type}' — skipped`, affected_files: [] };
    }
}
// ── composite ─────────────────────────────────────────────────────────────────
function runCompositeCheck(projectPath, check) {
    const checks = check["checks"];
    if (!Array.isArray(checks)) {
        return { passed: false, details: "composite check missing 'checks' array", affected_files: [] };
    }
    const failedDetails = [];
    const affectedFiles = [];
    for (const sub of checks) {
        const result = runCheck(projectPath, sub);
        if (!result.passed) {
            if (result.details)
                failedDetails.push(result.details);
            affectedFiles.push(...result.affected_files);
        }
    }
    if (failedDetails.length === 0)
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: failedDetails.join("; "),
        affected_files: [...new Set(affectedFiles)],
    };
}
// ── file_exists ───────────────────────────────────────────────────────────────
function checkFileExists(projectPath, check) {
    const file = check["file"];
    const fullPath = path.join(projectPath, file);
    if (fs.existsSync(fullPath))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `Required file '${file}' not found.`,
        affected_files: [file],
    };
}
// ── file_contains ─────────────────────────────────────────────────────────────
// Checks that a .properties-style file contains `property=expected_value`
function checkFileContains(projectPath, check) {
    const file = check["file"];
    const property = check["property"];
    const expectedValue = check["expected_value"];
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath)) {
        return { passed: false, details: `File '${file}' not found.`, affected_files: [file] };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const pattern = new RegExp(`^\\s*${escapeRegex(property)}\\s*=\\s*${escapeRegex(expectedValue)}`, "m");
    if (pattern.test(content))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `'${property}=${expectedValue}' missing or incorrect in ${file}.`,
        affected_files: [file],
    };
}
// ── gradle_int_property ───────────────────────────────────────────────────────
// Supports variables.gradle fallback for Capacitor projects.
function checkGradleIntProperty(projectPath, check) {
    const file = check["file"];
    const property = check["property"];
    const minValue = check["min_value"];
    // Check the declared file first, then common fallback locations
    const candidates = unique([
        file,
        "android/variables.gradle",
        "android/build.gradle",
    ]);
    for (const candidate of candidates) {
        const fullPath = path.join(projectPath, candidate);
        if (!fs.existsSync(fullPath))
            continue;
        const content = fs.readFileSync(fullPath, "utf-8");
        const match = content.match(new RegExp(`${escapeRegex(property)}\\s*(?:[=:\\s])\\s*(\\d+)`));
        if (!match)
            continue;
        const value = parseInt(match[1], 10);
        if (value >= minValue)
            return { passed: true, details: "", affected_files: [] };
        return {
            passed: false,
            details: `${property} is ${value} in ${candidate}, must be >= ${minValue}.`,
            affected_files: [candidate],
        };
    }
    return {
        passed: false,
        details: `${property} not found (checked ${candidates.join(", ")}). Must be >= ${minValue}.`,
        affected_files: [file],
    };
}
// ── gradle_cmake_arg ──────────────────────────────────────────────────────────
function checkGradleCmakeArg(projectPath, check) {
    const file = check["file"];
    const arg = check["arg"];
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath))
        return { passed: true, details: "", affected_files: [] };
    const content = fs.readFileSync(fullPath, "utf-8");
    if (content.includes(arg))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `cmake argument '${arg}' missing from ${file}.`,
        affected_files: [file],
    };
}
// ── gradle_classpath_version ──────────────────────────────────────────────────
function checkGradleClasspathVersion(projectPath, check) {
    const file = check["file"];
    const dependency = check["dependency"];
    const minVersion = check["min_version"];
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath)) {
        return { passed: false, details: `File '${file}' not found.`, affected_files: [file] };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const match = content.match(new RegExp(`${escapeRegex(dependency)}:(\\d+\\.\\d+\\.\\d+)`));
    if (!match)
        return { passed: true, details: "", affected_files: [] }; // not present — skip
    const current = match[1];
    if (!semver_1.default.lt(current, minVersion))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `${dependency} is ${current}, must be >= ${minVersion}.`,
        affected_files: [file],
    };
}
// ── properties_version ────────────────────────────────────────────────────────
function checkPropertiesVersion(projectPath, check) {
    const file = check["file"];
    const minVersion = check["min_version"];
    const versionPattern = check["version_pattern"];
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath)) {
        return { passed: false, details: `File '${file}' not found.`, affected_files: [file] };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const match = content.match(new RegExp(versionPattern));
    if (!match) {
        return { passed: false, details: `Version pattern not found in ${file}.`, affected_files: [file] };
    }
    const current = match[1];
    const coercedCurrent = semver_1.default.coerce(current);
    const coercedMin = semver_1.default.coerce(minVersion);
    if (!coercedCurrent || !coercedMin)
        return { passed: true, details: "", affected_files: [] };
    if (!semver_1.default.lt(coercedCurrent, coercedMin))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `Version in ${file} is ${current}, must be >= ${minVersion}.`,
        affected_files: [file],
    };
}
// ── podfile_platform_version ──────────────────────────────────────────────────
function checkPodfilePlatformVersion(projectPath, check) {
    const file = check["file"];
    const minVersion = check["min_version"];
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath))
        return { passed: true, details: "", affected_files: [] };
    const content = fs.readFileSync(fullPath, "utf-8");
    const match = content.match(/platform\s+:ios\s*,\s*['"](\d+\.\d+(?:\.\d+)?)['"]/);
    if (!match) {
        return {
            passed: false,
            details: `Could not find platform :ios version in ${file}.`,
            affected_files: [file],
        };
    }
    const current = match[1];
    const coercedCurrent = semver_1.default.coerce(current);
    const coercedMin = semver_1.default.coerce(minVersion);
    if (!coercedCurrent || !coercedMin || !semver_1.default.lt(coercedCurrent, coercedMin)) {
        return { passed: true, details: "", affected_files: [] };
    }
    return {
        passed: false,
        details: `Podfile sets platform :ios, '${current}' — must be >= ${minVersion}.`,
        affected_files: [file],
    };
}
// ── pbxproj_property ──────────────────────────────────────────────────────────
function checkPbxprojProperty(projectPath, check) {
    const property = check["property"];
    const minVersion = check["min_version"];
    const pbxprojPath = findPbxproj(path.join(projectPath, "ios"));
    if (!pbxprojPath)
        return { passed: true, details: "", affected_files: [] };
    const content = fs.readFileSync(pbxprojPath, "utf-8");
    const matches = [
        ...content.matchAll(new RegExp(`${escapeRegex(property)}\\s*=\\s*(\\d+\\.\\d+)`, "g")),
    ];
    if (matches.length === 0)
        return { passed: true, details: "", affected_files: [] };
    const outdated = matches.filter((m) => {
        const cc = semver_1.default.coerce(m[1]);
        const cm = semver_1.default.coerce(minVersion);
        return cc && cm && semver_1.default.lt(cc, cm);
    });
    if (outdated.length === 0)
        return { passed: true, details: "", affected_files: [] };
    const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
    return {
        passed: false,
        details: `${outdated.length} build configuration(s) set ${property} below ${minVersion}.`,
        affected_files: [relPath],
    };
}
// ── xcode_version_file ────────────────────────────────────────────────────────
function checkXcodeVersionFile(projectPath, check) {
    const files = check["files"];
    const minVersion = check["min_version"];
    for (const candidate of files) {
        const fullPath = path.join(projectPath, candidate);
        if (!fs.existsSync(fullPath))
            continue;
        const content = fs.readFileSync(fullPath, "utf-8").trim();
        const versionMatch = content.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (!versionMatch)
            continue;
        const current = versionMatch[1];
        const cc = semver_1.default.coerce(current);
        const cm = semver_1.default.coerce(minVersion);
        if (!cc || !cm)
            continue;
        if (semver_1.default.lt(cc, cm)) {
            return {
                passed: false,
                details: `${candidate} specifies Xcode ${current}. Must be >= ${minVersion}.`,
                affected_files: [candidate],
            };
        }
        return { passed: true, details: "", affected_files: [] };
    }
    return { passed: true, details: "", affected_files: [] };
}
// ── package_json_min_version ──────────────────────────────────────────────────
// Useful for new policies that require a minimum npm package version.
function checkPackageJsonMinVersion(projectPath, check) {
    const pkg = check["package"];
    const minVersion = check["min_version"];
    const pkgFile = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgFile))
        return { passed: true, details: "", affected_files: [] };
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
    }
    catch {
        return { passed: true, details: "", affected_files: [] };
    }
    const allDeps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    const raw = allDeps[pkg];
    if (!raw)
        return { passed: true, details: "", affected_files: [] }; // package not installed
    const coerced = semver_1.default.coerce(raw);
    if (!coerced)
        return { passed: true, details: "", affected_files: [] };
    if (!semver_1.default.lt(coerced, minVersion))
        return { passed: true, details: "", affected_files: [] };
    return {
        passed: false,
        details: `${pkg} is ${coerced.version}, must be >= ${minVersion}.`,
        affected_files: ["package.json"],
    };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function unique(arr) {
    return [...new Set(arr)];
}
function findPbxproj(iosDir) {
    if (!fs.existsSync(iosDir))
        return null;
    try {
        for (const entry of fs.readdirSync(iosDir)) {
            if (entry.endsWith(".xcodeproj")) {
                const candidate = path.join(iosDir, entry, "project.pbxproj");
                if (fs.existsSync(candidate))
                    return candidate;
            }
        }
    }
    catch { /* ignore */ }
    return null;
}
//# sourceMappingURL=check-runner.js.map
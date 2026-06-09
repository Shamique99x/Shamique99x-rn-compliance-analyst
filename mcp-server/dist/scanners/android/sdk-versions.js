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
exports.scanSdkVersions = scanSdkVersions;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver_1 = __importDefault(require("semver"));
const MIN_TARGET_SDK = 35;
const MIN_COMPILE_SDK = 35;
const MIN_AGP = "8.3.0";
const MIN_GRADLE = "8.6";
const TARGET_AGP = "8.3.2";
const TARGET_GRADLE = "8.6";
function scanSdkVersions(projectPath) {
    const violations = [];
    violations.push(...checkSdkLevels(projectPath));
    violations.push(...checkAgpVersion(projectPath));
    violations.push(...checkGradleWrapper(projectPath));
    return violations;
}
function checkSdkLevels(projectPath) {
    const appBuildFile = path.join(projectPath, "android", "app", "build.gradle");
    const rootBuildFile = path.join(projectPath, "android", "build.gradle");
    const appExists = fs.existsSync(appBuildFile);
    const rootExists = fs.existsSync(rootBuildFile);
    if (!appExists && !rootExists)
        return [];
    const appContent = appExists ? fs.readFileSync(appBuildFile, "utf-8") : "";
    const rootContent = rootExists ? fs.readFileSync(rootBuildFile, "utf-8") : "";
    // Read ext properties from root build.gradle for rootProject.ext.* references
    const rootExtProps = rootExists ? extractExtBlock(rootContent) : {};
    // Resolve each SDK property: check app/build.gradle first, then fall back to
    // android/build.gradle.  Each check tries both the "Version" suffix (Groovy DSL)
    // and the bare form (Kotlin DSL: compileSdk / targetSdk).
    const targetSdk = resolveIntProperty(appContent, "targetSdkVersion", rootExtProps) ??
        resolveIntProperty(appContent, "targetSdk", rootExtProps) ??
        resolveIntProperty(rootContent, "targetSdkVersion", rootExtProps) ??
        resolveIntProperty(rootContent, "targetSdk", rootExtProps);
    const compileSdk = resolveIntProperty(appContent, "compileSdkVersion", rootExtProps) ??
        resolveIntProperty(appContent, "compileSdk", rootExtProps) ??
        resolveIntProperty(rootContent, "compileSdkVersion", rootExtProps) ??
        resolveIntProperty(rootContent, "compileSdk", rootExtProps);
    const missing = [];
    if (targetSdk !== null && targetSdk < MIN_TARGET_SDK)
        missing.push(`targetSdkVersion is ${targetSdk}, must be >= ${MIN_TARGET_SDK}`);
    else if (targetSdk === null)
        missing.push("targetSdkVersion not found in android/app/build.gradle or android/build.gradle");
    if (compileSdk !== null && compileSdk < MIN_COMPILE_SDK)
        missing.push(`compileSdkVersion is ${compileSdk}, must be >= ${MIN_COMPILE_SDK}`);
    else if (compileSdk === null)
        missing.push("compileSdkVersion not found in android/app/build.gradle or android/build.gradle");
    if (missing.length === 0)
        return [];
    return [
        {
            policy_id: "android-target-sdk",
            policy_name: "Target & Compile SDK Version",
            platform: "android",
            severity: "error",
            auto_fixable: true,
            description: `Google Play requires targetSdkVersion >= ${MIN_TARGET_SDK} for all new submissions as of August 2025.`,
            docs_url: "https://developer.android.com/google/play/requirements/target-sdk",
            details: missing.join("; "),
            affected_files: resolveAffectedFile(appContent, rootContent, rootExtProps, rootBuildFile, appBuildFile, projectPath),
        },
    ];
}
function checkAgpVersion(projectPath) {
    const file = path.join(projectPath, "android", "build.gradle");
    if (!fs.existsSync(file))
        return [];
    const content = fs.readFileSync(file, "utf-8");
    const match = content.match(/com\.android\.tools\.build:gradle:(\d+\.\d+\.\d+)/);
    if (!match)
        return [];
    const current = match[1];
    if (!semver_1.default.lt(current, MIN_AGP))
        return [];
    return [
        {
            policy_id: "android-agp-version",
            policy_name: "Android Gradle Plugin Version",
            platform: "android",
            severity: "warning",
            auto_fixable: true,
            description: `AGP ${MIN_AGP}+ is required for 16 KB page size and API ${MIN_TARGET_SDK} support.`,
            docs_url: "https://developer.android.com/build/releases/gradle-plugin",
            details: `AGP is ${current}, must be >= ${MIN_AGP}. Will update to ${TARGET_AGP}.`,
            affected_files: ["android/build.gradle"],
        },
    ];
}
function checkGradleWrapper(projectPath) {
    const file = path.join(projectPath, "android", "gradle", "wrapper", "gradle-wrapper.properties");
    if (!fs.existsSync(file))
        return [];
    const content = fs.readFileSync(file, "utf-8");
    const match = content.match(/gradle-(\d+\.\d+(?:\.\d+)?)-/);
    if (!match)
        return [];
    const current = match[1];
    const coercedCurrent = semver_1.default.coerce(current);
    const coercedMin = semver_1.default.coerce(MIN_GRADLE);
    if (!coercedCurrent || !coercedMin)
        return []; // malformed version string — skip
    if (!semver_1.default.lt(coercedCurrent, coercedMin))
        return [];
    return [
        {
            policy_id: "android-gradle-wrapper",
            policy_name: "Gradle Wrapper Version",
            platform: "android",
            severity: "warning",
            auto_fixable: true,
            description: `Gradle ${MIN_GRADLE}+ is required to work with AGP ${MIN_AGP}+.`,
            docs_url: "https://developer.android.com/build/releases/gradle-plugin#updating-gradle",
            details: `Gradle wrapper is ${current}, must be >= ${MIN_GRADLE}. Will update to ${TARGET_GRADLE}.`,
            affected_files: ["android/gradle/wrapper/gradle-wrapper.properties"],
        },
    ];
}
// Reads integer property directly from content, or looks up ext block if value is a rootProject.ext.* reference
function resolveIntProperty(appContent, property, rootExtProps) {
    // Direct integer value: compileSdkVersion 35 / compileSdkVersion = 35
    const directMatch = appContent.match(new RegExp(`${property}\\s*(?:[=:\\s])\\s*(\\d+)`));
    if (directMatch)
        return parseInt(directMatch[1], 10);
    // rootProject.ext.* reference: compileSdkVersion rootProject.ext.compileSdkVersion
    const extRefMatch = appContent.match(new RegExp(`${property}\\s+rootProject\\.ext\\.(\\w+)`));
    if (extRefMatch) {
        const extKey = extRefMatch[1];
        return rootExtProps[extKey] ?? null;
    }
    return null;
}
// Extracts key=value integer pairs from ALL ext { } blocks in a build.gradle file.
// Handles both top-level and indented ext blocks (e.g. inside buildscript { ext { } }).
function extractExtBlock(rootContent) {
    const result = {};
    // Find every `ext {` block regardless of indentation
    const extBlockRegex = /\bext\s*\{([^}]+)\}/g;
    let match;
    while ((match = extBlockRegex.exec(rootContent)) !== null) {
        const block = match[1];
        for (const line of block.split("\n")) {
            const kv = line.match(/(\w+)\s*=\s*(\d+)/);
            if (kv)
                result[kv[1]] = parseInt(kv[2], 10);
        }
    }
    return result;
}
function resolveAffectedFile(appContent, rootContent, rootExtProps, rootBuildFile, appBuildFile, projectPath) {
    const sdkPropRegex = /(?:targetSdkVersion|compileSdkVersion|targetSdk|compileSdk)/;
    // ext ref in app/build.gradle → root build file holds the value
    const usesExtRef = /(?:targetSdkVersion|compileSdkVersion|targetSdk|compileSdk)\s+rootProject\.ext\./.test(appContent);
    if (usesExtRef && Object.keys(rootExtProps).length > 0) {
        return [path.relative(projectPath, rootBuildFile).replace(/\\/g, "/")];
    }
    // Direct declaration in app/build.gradle
    if (appContent && sdkPropRegex.test(appContent)) {
        return [path.relative(projectPath, appBuildFile).replace(/\\/g, "/")];
    }
    // Direct declaration in android/build.gradle (no app-level file or not found there)
    if (rootContent && sdkPropRegex.test(rootContent)) {
        return [path.relative(projectPath, rootBuildFile).replace(/\\/g, "/")];
    }
    // Fallback: report both files so the user knows where to look
    const files = [];
    if (fs.existsSync(appBuildFile))
        files.push(path.relative(projectPath, appBuildFile).replace(/\\/g, "/"));
    if (fs.existsSync(rootBuildFile))
        files.push(path.relative(projectPath, rootBuildFile).replace(/\\/g, "/"));
    return files;
}
//# sourceMappingURL=sdk-versions.js.map
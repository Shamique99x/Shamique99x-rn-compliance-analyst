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
exports.fixSdkVersions = fixSdkVersions;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const TARGET_SDK = 35;
const TARGET_AGP = "8.3.2";
const TARGET_GRADLE_URL = "https\\://services.gradle.org/distributions/gradle-8.6-all.zip";
function fixSdkVersions(projectPath) {
    // Do NOT filter here — callers rely on the fixed order [0]=targetSdk, [1]=agp, [2]=wrapper.
    // Results with no changes are kept so indices never shift.
    return [
        fixAppBuildGradle(projectPath),
        fixRootBuildGradle(projectPath),
        fixGradleWrapper(projectPath),
    ];
}
function fixAppBuildGradle(projectPath) {
    const file = path.join(projectPath, "android", "app", "build.gradle");
    const changes = [];
    if (!fs.existsSync(file)) {
        return { violation_id: "android-target-sdk", success: false, changes, error: "android/app/build.gradle not found" };
    }
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;
    for (const prop of ["targetSdkVersion", "compileSdkVersion"]) {
        // Match Groovy DSL formats: `targetSdkVersion 35`, `targetSdkVersion = 35`, `targetSdkVersion: 35`
        const regex = new RegExp(`(${prop}\\s*(?:[=:\\s])\\s*)(\\d+)`);
        const match = content.match(regex);
        if (match && parseInt(match[2], 10) < TARGET_SDK) {
            content = content.replace(regex, `$1${TARGET_SDK}`);
            modified = true;
        }
    }
    if (modified) {
        const backup = (0, utils_1.backupAndWrite)(file, content);
        changes.push({
            file: "android/app/build.gradle",
            description: `Bumped compileSdkVersion and targetSdkVersion to ${TARGET_SDK}`,
            backup_path: backup,
        });
    }
    return { violation_id: "android-target-sdk", success: true, changes };
}
function fixRootBuildGradle(projectPath) {
    const file = path.join(projectPath, "android", "build.gradle");
    const changes = [];
    if (!fs.existsSync(file)) {
        return { violation_id: "android-agp-version", success: true, changes };
    }
    let content = fs.readFileSync(file, "utf-8");
    const agpRegex = /(com\.android\.tools\.build:gradle:)(\d+\.\d+\.\d+)/;
    const match = content.match(agpRegex);
    if (match && isOlderThan(match[2], TARGET_AGP)) {
        content = content.replace(agpRegex, `$1${TARGET_AGP}`);
        const backup = (0, utils_1.backupAndWrite)(file, content);
        changes.push({
            file: "android/build.gradle",
            description: `Updated AGP from ${match[2]} to ${TARGET_AGP}`,
            backup_path: backup,
        });
    }
    return { violation_id: "android-agp-version", success: true, changes };
}
function fixGradleWrapper(projectPath) {
    const file = path.join(projectPath, "android", "gradle", "wrapper", "gradle-wrapper.properties");
    const changes = [];
    if (!fs.existsSync(file)) {
        return { violation_id: "android-gradle-wrapper", success: true, changes };
    }
    let content = fs.readFileSync(file, "utf-8");
    const urlRegex = /(distributionUrl\s*=\s*).+/;
    const match = content.match(/gradle-(\d+\.\d+(?:\.\d+)?)-/);
    if (match && isOlderThan(match[1], "8.6")) {
        content = content.replace(urlRegex, `$1${TARGET_GRADLE_URL}`);
        const backup = (0, utils_1.backupAndWrite)(file, content);
        changes.push({
            file: "android/gradle/wrapper/gradle-wrapper.properties",
            description: `Updated Gradle wrapper from ${match[1]} to 8.6`,
            backup_path: backup,
        });
    }
    return { violation_id: "android-gradle-wrapper", success: true, changes };
}
function isOlderThan(current, target) {
    const parse = (v) => v.split(".").map(Number);
    const [ca, cb, cc = 0] = parse(current);
    const [ta, tb, tc = 0] = parse(target);
    if (ca !== ta)
        return ca < ta;
    if (cb !== tb)
        return cb < tb;
    return cc < tc;
}
//# sourceMappingURL=sdk-version-fixer.js.map
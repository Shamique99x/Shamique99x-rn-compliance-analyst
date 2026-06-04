"use strict";
/**
 * compliance_inspect_apk
 *
 * Runs the APK-level 16 KB page-size inspection on a specific APK file
 * (or auto-discovers one) and returns the full native library report
 * plus package upgrade suggestions.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectApkTool = inspectApkTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const apk_inspector_1 = require("../scanners/android/apk-inspector");
const lib_mapper_1 = require("../scanners/android/lib-mapper");
/**
 * @param projectPath  Root of the RN project (used for APK discovery + package.json lookup)
 * @param apkPath      Explicit path to an APK file. If omitted, auto-discovers.
 * @param variant      "debug" | "release" — hint for auto-discovery when apkPath is omitted
 */
async function inspectApkTool(projectPath, apkPath, variant) {
    const absProject = path.resolve(projectPath);
    // Resolve the APK path
    let resolvedApk = null;
    if (apkPath) {
        // Caller passed an explicit path
        resolvedApk = path.resolve(apkPath);
        if (!fs.existsSync(resolvedApk)) {
            return {
                inspection: {
                    apk_path: resolvedApk,
                    libraries_checked: 0,
                    non_compliant: [],
                    compliant: false,
                    error: `APK not found at: ${resolvedApk}`,
                },
                upgrades: [],
            };
        }
    }
    else {
        // Auto-discover, with optional variant hint
        resolvedApk = findApkByVariant(absProject, variant);
        if (!resolvedApk) {
            return {
                inspection: {
                    apk_path: "",
                    libraries_checked: 0,
                    non_compliant: [],
                    compliant: false,
                    error: "No APK found in android/app/build/outputs/apk/. " +
                        "Build one first with: cd android && ./gradlew assembleDebug",
                },
                upgrades: [],
            };
        }
    }
    const inspection = (0, apk_inspector_1.inspectApk)(resolvedApk);
    const upgrades = inspection.non_compliant.length > 0
        ? await (0, lib_mapper_1.resolveUpgrades)(inspection.non_compliant, absProject)
        : [];
    return { inspection, upgrades };
}
// ── APK discovery with optional variant hint ──────────────────────────────────
function findApkByVariant(projectPath, variant) {
    const outputDir = path.join(projectPath, "android/app/build/outputs/apk");
    if (!fs.existsSync(outputDir))
        return null;
    // If a variant hint was given, check that subdirectory first
    if (variant) {
        const hintDir = path.join(outputDir, variant);
        if (fs.existsSync(hintDir)) {
            for (const file of fs.readdirSync(hintDir)) {
                if (file.endsWith(".apk"))
                    return path.join(hintDir, file);
            }
        }
    }
    // Fall back to the generic finder
    return (0, apk_inspector_1.findApk)(projectPath);
}
//# sourceMappingURL=inspect-apk.js.map
"use strict";
/**
 * APK-level 16 KB page-size compliance inspector.
 *
 * Build-config checks (gradle.properties, CMakeLists.txt) can only verify
 * your own code.  A third-party native library compiled without the right
 * alignment flags will still cause crashes on 16 KB devices even when all
 * the Gradle flags are correct.
 *
 * This inspector:
 *   1. Locates a built APK in the project's standard output directories.
 *   2. Opens it as a ZIP and iterates every lib/<abi>/<name>.so entry.
 *   3. For each .so it checks:
 *        a. Compression — must be STORED (method 0), not DEFLATED.
 *           Compressed .so files cannot be memory-mapped by the OS.
 *        b. PT_LOAD alignment — minimum alignment across all PT_LOAD
 *           ELF segments must be >= 16 384 bytes (0x4000).
 *   4. Returns a structured result listing every non-compliant library.
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
exports.findApk = findApk;
exports.inspectApk = inspectApk;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const elf_parser_1 = require("./elf-parser");
// 32-bit ABIs use 4 KB pages by CPU architecture — the 16 KB requirement
// only applies to 64-bit ABIs.  Never flag these as non-compliant.
const THIRTY_TWO_BIT_ABIS = new Set(["armeabi-v7a", "armeabi", "x86", "mips"]);
// ── APK discovery ─────────────────────────────────────────────────────────────
const APK_CANDIDATES = [
    "android/app/build/outputs/apk/debug/app-debug.apk",
    "android/app/build/outputs/apk/release/app-release.apk",
    "android/app/build/outputs/apk/release/app-release-unsigned.apk",
    // bundle tool universal APK output
    "android/app/build/outputs/apk/debugAndroidTest/app-debug-androidTest.apk",
];
function findApk(projectPath) {
    for (const rel of APK_CANDIDATES) {
        const full = path.join(projectPath, rel);
        if (fs.existsSync(full))
            return full;
    }
    // Also do a shallow glob under build/outputs/apk/ for non-standard names
    const outputDir = path.join(projectPath, "android/app/build/outputs/apk");
    if (!fs.existsSync(outputDir))
        return null;
    for (const variant of fs.readdirSync(outputDir)) {
        const variantDir = path.join(outputDir, variant);
        if (!fs.statSync(variantDir).isDirectory())
            continue;
        for (const file of fs.readdirSync(variantDir)) {
            if (file.endsWith(".apk"))
                return path.join(variantDir, file);
        }
    }
    return null;
}
// ── Core inspector ────────────────────────────────────────────────────────────
function inspectApk(apkPath) {
    let zip;
    try {
        zip = new adm_zip_1.default(apkPath);
    }
    catch (err) {
        return {
            apk_path: apkPath,
            libraries_checked: 0,
            non_compliant: [],
            compliant: false,
            error: `Could not open APK: ${err.message}`,
        };
    }
    const results = [];
    for (const entry of zip.getEntries()) {
        // Only care about native libraries: lib/<abi>/<name>.so
        const match = entry.entryName.match(/^lib\/([^/]+)\/(.+\.so(?:\.[^/]+)?)$/);
        if (!match)
            continue;
        const [, abi, name] = match;
        const issues = [];
        // ── Check 1: compression ────────────────────────────────────────────────
        // ZIP method 0 = STORED, method 8 = DEFLATED.
        // adm-zip exposes this via entry.header.method.
        const method = entry.header.method;
        const compressed = method !== 0;
        if (compressed) {
            issues.push(`Stored with compression (method=${method}) — must be STORED (method=0) ` +
                `so the OS can memory-map it directly`);
        }
        // ── Check 2: ELF PT_LOAD alignment ──────────────────────────────────────
        let load_alignment = null;
        try {
            const data = entry.getData();
            const info = (0, elf_parser_1.parseElf)(data);
            if (info) {
                load_alignment = info.minLoadAlignment;
                // 16 KB page-size requirement only applies to 64-bit ABIs.
                // 32-bit ABIs (armeabi-v7a, x86, etc.) intentionally use 4 KB pages.
                if (!THIRTY_TWO_BIT_ABIS.has(abi) && load_alignment < elf_parser_1.PAGE_16KB) {
                    issues.push(`PT_LOAD alignment is ${load_alignment} bytes ` +
                        `(0x${load_alignment.toString(16).toUpperCase()}) — ` +
                        `must be ≥ 16 384 bytes (0x4000) for 16 KB page-size devices`);
                }
            }
            else {
                issues.push("Could not parse ELF program headers");
            }
        }
        catch (err) {
            issues.push(`ELF read error: ${err.message}`);
        }
        results.push({
            name,
            abi,
            compressed,
            load_alignment,
            compliant: issues.length === 0,
            issues,
        });
    }
    const nonCompliant = results.filter((r) => !r.compliant);
    return {
        apk_path: apkPath,
        libraries_checked: results.length,
        non_compliant: nonCompliant,
        compliant: nonCompliant.length === 0,
    };
}
//# sourceMappingURL=apk-inspector.js.map
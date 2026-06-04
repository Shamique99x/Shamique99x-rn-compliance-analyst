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
exports.scanPrivacyManifest = scanPrivacyManifest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const xml2js_1 = require("xml2js");
const API_PATTERNS = [
    {
        category: "NSPrivacyAccessedAPICategoryUserDefaults",
        patterns: ["NSUserDefaults", "UserDefaults.standard", "AsyncStorage"],
        required_reason_codes: ["CA92.1", "1C8F.1", "AC6B.1", "C56D.1"],
    },
    {
        category: "NSPrivacyAccessedAPICategoryFileTimestamp",
        patterns: ["NSFileManager", "FileManager.default", "attributesOfItem", "modificationDate"],
        required_reason_codes: ["DDA9.1", "C617.1", "3B52.1", "0A2A.1"],
    },
    {
        category: "NSPrivacyAccessedAPICategorySystemBootTime",
        patterns: ["systemUptime", "mach_absolute_time", "ProcessInfo.processInfo.systemUptime"],
        required_reason_codes: ["35F9.1", "8FFB.1", "3D61.1"],
    },
    {
        category: "NSPrivacyAccessedAPICategoryDiskSpace",
        patterns: ["volumeAvailableCapacityForImportantUsage", "volumeTotalCapacity", "NSFileSystemFreeSize"],
        required_reason_codes: ["85F4.1", "E174.1"],
    },
];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".m", ".mm", ".swift"];
async function scanPrivacyManifest(projectPath) {
    const violations = [];
    const manifestPath = path.join(projectPath, "ios", "PrivacyInfo.xcprivacy");
    if (!fs.existsSync(manifestPath)) {
        violations.push({
            policy_id: "ios-privacy-manifest-exists",
            policy_name: "Privacy Manifest File (PrivacyInfo.xcprivacy)",
            platform: "ios",
            severity: "error",
            auto_fixable: true,
            description: "Apple requires a PrivacyInfo.xcprivacy file in all app submissions. Missing this file causes App Store rejection.",
            docs_url: "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files",
            details: "ios/PrivacyInfo.xcprivacy does not exist.",
            affected_files: ["ios/PrivacyInfo.xcprivacy"],
        });
    }
    const usedCategories = detectUsedApiCategories(projectPath);
    if (usedCategories.length === 0)
        return violations;
    let declaredCategories = [];
    if (fs.existsSync(manifestPath)) {
        declaredCategories = await extractDeclaredCategories(manifestPath);
    }
    const missing = usedCategories.filter((cat) => !declaredCategories.includes(cat));
    if (missing.length > 0) {
        violations.push({
            policy_id: "ios-privacy-required-reason-apis",
            policy_name: "Required Reason APIs Declaration",
            platform: "ios",
            severity: "error",
            auto_fixable: true,
            description: "APIs that access user data require a declared reason in PrivacyInfo.xcprivacy. Missing entries cause App Store rejection.",
            docs_url: "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api",
            details: `Missing NSPrivacyAccessedAPITypes entries: ${missing.join(", ")}`,
            affected_files: ["ios/PrivacyInfo.xcprivacy"],
        });
    }
    return violations;
}
function detectUsedApiCategories(projectPath) {
    const detected = new Set();
    // Scan well-known source directories first.
    // The project root is scanned last but skips any subdirectory already covered,
    // preventing the same file being read twice (e.g. src/ files visited once via
    // the explicit "src" root and again when recursing from projectPath).
    const explicitRoots = ["src", "app", "ios"].map((d) => path.join(projectPath, d));
    for (const root of explicitRoots) {
        if (fs.existsSync(root))
            scanDir(root, detected);
    }
    // Scan the project root, skipping directories that were already scanned above
    const scannedDirs = new Set(explicitRoots.map((r) => path.resolve(r)));
    scanDirSkipping(projectPath, detected, scannedDirs);
    return [...detected];
}
function scanDirSkipping(dir, detected, skip) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (skip.has(path.resolve(full)))
                continue; // already scanned
            scanDirSkipping(full, detected, skip);
        }
        else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
            try {
                const content = fs.readFileSync(full, "utf-8");
                for (const api of API_PATTERNS) {
                    if (api.patterns.some((p) => content.includes(p))) {
                        detected.add(api.category);
                    }
                }
            }
            catch {
                // skip unreadable files
            }
        }
    }
}
function scanDir(dir, detected) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanDir(full, detected);
        }
        else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
            try {
                const content = fs.readFileSync(full, "utf-8");
                for (const api of API_PATTERNS) {
                    if (api.patterns.some((p) => content.includes(p))) {
                        detected.add(api.category);
                    }
                }
            }
            catch {
                // skip unreadable files
            }
        }
    }
}
async function extractDeclaredCategories(manifestPath) {
    try {
        const content = fs.readFileSync(manifestPath, "utf-8");
        const parsed = await (0, xml2js_1.parseStringPromise)(content);
        const dict = parsed?.plist?.dict?.[0];
        if (!dict)
            return [];
        const keys = dict.key ?? [];
        const apiTypesIdx = keys.indexOf("NSPrivacyAccessedAPITypes");
        if (apiTypesIdx === -1)
            return [];
        const arrays = dict.array ?? [];
        const apiArray = arrays[apiTypesIdx];
        if (!apiArray?.dict)
            return [];
        const categories = [];
        for (const entry of apiArray.dict) {
            const entryKeys = entry.key ?? [];
            const entryStrings = entry.string ?? [];
            const catIdx = entryKeys.indexOf("NSPrivacyAccessedAPIType");
            if (catIdx !== -1 && entryStrings[catIdx]) {
                categories.push(entryStrings[catIdx]);
            }
        }
        return categories;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=privacy-manifest.js.map
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
exports.fixPrivacyManifest = fixPrivacyManifest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const PRIVACY_MANIFEST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
</dict>
</plist>
`;
const API_PATTERNS = [
    {
        category: "NSPrivacyAccessedAPICategoryUserDefaults",
        patterns: ["NSUserDefaults", "UserDefaults.standard", "AsyncStorage"],
        default_reason: "CA92.1",
    },
    {
        category: "NSPrivacyAccessedAPICategoryFileTimestamp",
        patterns: ["NSFileManager", "FileManager.default", "attributesOfItem", "modificationDate"],
        default_reason: "C617.1",
    },
    {
        category: "NSPrivacyAccessedAPICategorySystemBootTime",
        patterns: ["systemUptime", "mach_absolute_time", "ProcessInfo.processInfo.systemUptime"],
        default_reason: "35F9.1",
    },
    {
        category: "NSPrivacyAccessedAPICategoryDiskSpace",
        patterns: ["volumeAvailableCapacityForImportantUsage", "volumeTotalCapacity", "NSFileSystemFreeSize"],
        default_reason: "85F4.1",
    },
];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".m", ".mm", ".swift"];
async function fixPrivacyManifest(projectPath) {
    const manifestPath = path.join(projectPath, "ios", "PrivacyInfo.xcprivacy");
    const changes = [];
    // Create manifest if missing
    if (!fs.existsSync(manifestPath)) {
        const backup = (0, utils_1.backupAndWrite)(manifestPath, PRIVACY_MANIFEST_TEMPLATE);
        changes.push({
            file: "ios/PrivacyInfo.xcprivacy",
            description: "Created PrivacyInfo.xcprivacy with default template",
            backup_path: backup,
        });
    }
    // Detect used API categories and append missing entries
    const needed = detectNeededEntries(projectPath);
    if (needed.length > 0) {
        const backup = await appendMissingApiEntries(manifestPath, needed);
        if (backup) {
            changes.push({
                file: "ios/PrivacyInfo.xcprivacy",
                description: `Added NSPrivacyAccessedAPITypes entries: ${needed.map((n) => n.category).join(", ")}`,
                backup_path: backup,
            });
        }
    }
    return {
        violation_id: "ios-privacy-manifest-exists",
        success: true,
        changes,
    };
}
function detectNeededEntries(projectPath) {
    const needed = [];
    // Scan specific subdirectories first, then the root skipping those dirs
    const explicitRoots = ["src", "app", "ios"].map((d) => path.join(projectPath, d));
    for (const root of explicitRoots) {
        if (fs.existsSync(root))
            collectFromDir(root, needed);
    }
    const scannedDirs = new Set(explicitRoots.map((r) => path.resolve(r)));
    collectFromDirSkipping(projectPath, needed, scannedDirs);
    return deduplicateByCategory(needed);
}
function collectFromDirSkipping(dir, needed, skip) {
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
                continue;
            collectFromDirSkipping(full, needed, skip);
        }
        else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
            try {
                const content = fs.readFileSync(full, "utf-8");
                for (const api of API_PATTERNS) {
                    if (api.patterns.some((p) => content.includes(p))) {
                        needed.push({ category: api.category, reason_code: api.default_reason });
                    }
                }
            }
            catch {
                // skip
            }
        }
    }
}
function collectFromDir(dir, needed) {
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
            collectFromDir(full, needed);
        }
        else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
            try {
                const content = fs.readFileSync(full, "utf-8");
                for (const api of API_PATTERNS) {
                    if (api.patterns.some((p) => content.includes(p))) {
                        needed.push({ category: api.category, reason_code: api.default_reason });
                    }
                }
            }
            catch {
                // skip
            }
        }
    }
}
/**
 * Append missing NSPrivacyAccessedAPITypes entries to the manifest using
 * direct XML string manipulation.  This avoids xml2js positional-index issues
 * that arise when the plist dict contains non-array siblings before the target key.
 */
async function appendMissingApiEntries(manifestPath, entries) {
    let content = fs.readFileSync(manifestPath, "utf-8");
    // Extract existing categories by scanning the text that follows
    // <key>NSPrivacyAccessedAPITypes</key>
    const existingCategories = extractExistingCategories(content);
    const toAdd = entries.filter((e) => !existingCategories.includes(e.category));
    if (toAdd.length === 0)
        return null;
    const newDictEntries = toAdd
        .map((e) => `\t\t\t<dict>\n` +
        `\t\t\t\t<key>NSPrivacyAccessedAPIType</key>\n` +
        `\t\t\t\t<string>${e.category}</string>\n` +
        `\t\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>\n` +
        `\t\t\t\t<array>\n` +
        `\t\t\t\t\t<string>${e.reason_code}</string>\n` +
        `\t\t\t\t</array>\n` +
        `\t\t\t</dict>`)
        .join("\n");
    // Strategy 1: NSPrivacyAccessedAPITypes key already exists — find its <array> and inject inside
    const apiTypesPattern = /(<key>NSPrivacyAccessedAPITypes<\/key>\s*<array>)([\s\S]*?)(<\/array>)/;
    if (apiTypesPattern.test(content)) {
        content = content.replace(apiTypesPattern, (_m, open, inner, close) => {
            const sep = inner.trim() ? "\n" : "";
            return `${open}${inner}${sep}\n${newDictEntries}\n\t\t${close}`;
        });
        return (0, utils_1.backupAndWrite)(manifestPath, content);
    }
    // Strategy 2: Key exists but with self-closing <array/> — replace it
    const selfClosingPattern = /(<key>NSPrivacyAccessedAPITypes<\/key>\s*)<array\/>/;
    if (selfClosingPattern.test(content)) {
        content = content.replace(selfClosingPattern, `$1<array>\n${newDictEntries}\n\t\t</array>`);
        return (0, utils_1.backupAndWrite)(manifestPath, content);
    }
    // Strategy 3: Key not present at all — insert before </dict>
    const closingDict = content.lastIndexOf("</dict>");
    if (closingDict === -1)
        return null; // malformed plist
    const insertion = `\t\t<key>NSPrivacyAccessedAPITypes</key>\n` +
        `\t\t<array>\n` +
        `${newDictEntries}\n` +
        `\t\t</array>\n`;
    content = content.slice(0, closingDict) + insertion + content.slice(closingDict);
    return (0, utils_1.backupAndWrite)(manifestPath, content);
}
/** Read all NSPrivacyAccessedAPIType string values already in the manifest. */
function extractExistingCategories(xmlContent) {
    const categories = [];
    // Find the block between <key>NSPrivacyAccessedAPITypes</key> and the matching </array>
    const sectionMatch = xmlContent.match(/<key>NSPrivacyAccessedAPITypes<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (!sectionMatch)
        return categories;
    const section = sectionMatch[1];
    // Each entry has <key>NSPrivacyAccessedAPIType</key><string>...</string>
    const catRegex = /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>/g;
    let m;
    while ((m = catRegex.exec(section)) !== null) {
        categories.push(m[1]);
    }
    return categories;
}
function deduplicateByCategory(entries) {
    const seen = new Set();
    return entries.filter((e) => {
        if (seen.has(e.category))
            return false;
        seen.add(e.category);
        return true;
    });
}
//# sourceMappingURL=privacy-manifest-fixer.js.map
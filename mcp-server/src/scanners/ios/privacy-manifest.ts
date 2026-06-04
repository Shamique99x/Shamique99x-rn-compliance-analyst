import * as fs from "fs";
import * as path from "path";
import { parseStringPromise } from "xml2js";
import { Violation } from "../../types";

interface ApiPattern {
  category: string;
  patterns: string[];
  required_reason_codes: string[];
}

const API_PATTERNS: ApiPattern[] = [
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

export async function scanPrivacyManifest(projectPath: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const manifestPath = path.join(projectPath, "ios", "PrivacyInfo.xcprivacy");

  if (!fs.existsSync(manifestPath)) {
    violations.push({
      policy_id: "ios-privacy-manifest-exists",
      policy_name: "Privacy Manifest File (PrivacyInfo.xcprivacy)",
      platform: "ios",
      severity: "error",
      auto_fixable: true,
      description:
        "Apple requires a PrivacyInfo.xcprivacy file in all app submissions. Missing this file causes App Store rejection.",
      docs_url: "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files",
      details: "ios/PrivacyInfo.xcprivacy does not exist.",
      affected_files: ["ios/PrivacyInfo.xcprivacy"],
    });
  }

  const usedCategories = detectUsedApiCategories(projectPath);
  if (usedCategories.length === 0) return violations;

  let declaredCategories: string[] = [];
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
      description:
        "APIs that access user data require a declared reason in PrivacyInfo.xcprivacy. Missing entries cause App Store rejection.",
      docs_url:
        "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api",
      details: `Missing NSPrivacyAccessedAPITypes entries: ${missing.join(", ")}`,
      affected_files: ["ios/PrivacyInfo.xcprivacy"],
    });
  }

  return violations;
}

function detectUsedApiCategories(projectPath: string): string[] {
  const detected = new Set<string>();

  // Scan well-known source directories first.
  // The project root is scanned last but skips any subdirectory already covered,
  // preventing the same file being read twice (e.g. src/ files visited once via
  // the explicit "src" root and again when recursing from projectPath).
  const explicitRoots = ["src", "app", "ios"].map((d) => path.join(projectPath, d));
  for (const root of explicitRoots) {
    if (fs.existsSync(root)) scanDir(root, detected);
  }

  // Scan the project root, skipping directories that were already scanned above
  const scannedDirs = new Set(explicitRoots.map((r) => path.resolve(r)));
  scanDirSkipping(projectPath, detected, scannedDirs);

  return [...detected];
}

function scanDirSkipping(dir: string, detected: Set<string>, skip: Set<string>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(path.resolve(full))) continue; // already scanned
      scanDirSkipping(full, detected, skip);
    } else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
      try {
        const content = fs.readFileSync(full, "utf-8");
        for (const api of API_PATTERNS) {
          if (api.patterns.some((p) => content.includes(p))) {
            detected.add(api.category);
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }
}

function scanDir(dir: string, detected: Set<string>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, detected);
    } else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
      try {
        const content = fs.readFileSync(full, "utf-8");
        for (const api of API_PATTERNS) {
          if (api.patterns.some((p) => content.includes(p))) {
            detected.add(api.category);
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }
}

async function extractDeclaredCategories(manifestPath: string): Promise<string[]> {
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    const parsed = await parseStringPromise(content);
    const dict = parsed?.plist?.dict?.[0];
    if (!dict) return [];

    const keys: string[] = dict.key ?? [];
    const apiTypesIdx = keys.indexOf("NSPrivacyAccessedAPITypes");
    if (apiTypesIdx === -1) return [];

    const arrays = dict.array ?? [];
    const apiArray = arrays[apiTypesIdx];
    if (!apiArray?.dict) return [];

    const categories: string[] = [];
    for (const entry of apiArray.dict) {
      const entryKeys: string[] = entry.key ?? [];
      const entryStrings: string[] = entry.string ?? [];
      const catIdx = entryKeys.indexOf("NSPrivacyAccessedAPIType");
      if (catIdx !== -1 && entryStrings[catIdx]) {
        categories.push(entryStrings[catIdx]);
      }
    }
    return categories;
  } catch {
    return [];
  }
}

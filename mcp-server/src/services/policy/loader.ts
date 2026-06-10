import * as fs from "fs";
import * as path from "path";
import { PolicyDatabase, Platform } from "../../types";
import { readCache } from "./cache";

const BUNDLED_DIR = path.join(__dirname, "../../../policies");

export function loadPolicies(platform: Platform): PolicyDatabase {
  const bundled = loadBundled(platform);
  const cached = readCache(platform);

  if (cached && isNewer(cached.version, bundled.version)) {
    return cached;
  }
  return bundled;
}

export function loadAllPolicies(): PolicyDatabase[] {
  return (["android", "ios"] as Platform[]).map(loadPolicies);
}

function loadBundled(platform: Platform): PolicyDatabase {
  const file = path.join(BUNDLED_DIR, `${platform}.json`);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as PolicyDatabase;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Bundled policy file not found: ${file}\n` +
        `This usually means the plugin was not installed correctly or the dist/ folder is missing.\n` +
        `Re-install the plugin with: claude plugin install <path-to-plugin>`
      );
    }
    throw err;
  }
}

function isNewer(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { numeric: true }) > 0;
}

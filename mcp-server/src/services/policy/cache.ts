import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PolicyDatabase, Platform } from "../../types";

const CACHE_DIR =
  process.env.PLUGIN_CACHE_DIR ??
  path.join(os.homedir(), ".claude", "compliance-policy-cache");
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  fetched_at: string;
  data: PolicyDatabase;
}

function cacheFile(platform: Platform): string {
  return path.join(CACHE_DIR, `${platform}.json`);
}

export function readCache(platform: Platform): PolicyDatabase | null {
  const file = cacheFile(platform);
  if (!fs.existsSync(file)) return null;

  try {
    const entry: CacheEntry = JSON.parse(fs.readFileSync(file, "utf-8"));
    const age = Date.now() - new Date(entry.fetched_at).getTime();
    if (age > TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache(platform: Platform, data: PolicyDatabase): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { fetched_at: new Date().toISOString(), data };
  const tmp = cacheFile(platform) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), "utf-8");
  fs.renameSync(tmp, cacheFile(platform));
}

export function isCacheStale(platform: Platform): boolean {
  const file = cacheFile(platform);
  if (!fs.existsSync(file)) return true;
  try {
    const entry: CacheEntry = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Date.now() - new Date(entry.fetched_at).getTime() > TTL_MS;
  } catch {
    return true;
  }
}

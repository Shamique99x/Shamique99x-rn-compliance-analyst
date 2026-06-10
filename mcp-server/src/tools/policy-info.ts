/**
 * compliance_policy_info
 *
 * Returns metadata about every policy database currently loaded:
 * versions, policy counts, cache age, and source (remote cache vs bundled).
 */

import * as fs   from "fs";
import * as os   from "os";
import * as path from "path";
import { loadPolicies }  from "../services/policy/loader";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformPolicyInfo {
  version: string;
  policy_count: number;
  /** ISO timestamp of when the remote cache was last written, or null if never fetched */
  fetched_at: string | null;
  /** Age of the cache in hours, or null if never fetched */
  cache_age_hours: number | null;
  /** true if cache is older than 24 h or doesn't exist */
  stale: boolean;
  /** "cache" if a valid remote cache is in use, "bundled" otherwise */
  source: "cache" | "bundled";
  policies: Array<{ id: string; name: string; severity: string; auto_fixable: boolean }>;
}

export interface NativeLibMapInfo {
  version: string;
  mapping_count: number;
}

export interface PolicyInfoResult {
  android: PlatformPolicyInfo;
  ios: PlatformPolicyInfo;
  native_lib_map: NativeLibMapInfo;
}

// ── Cache metadata reader ─────────────────────────────────────────────────────

const CACHE_DIR =
  process.env.PLUGIN_CACHE_DIR ??
  path.join(os.homedir(), ".claude", "compliance-policy-cache");

const TTL_MS = 24 * 60 * 60 * 1000;

function readCacheMeta(platform: string): { fetched_at: string | null; stale: boolean; source: "cache" | "bundled" } {
  const file = path.join(CACHE_DIR, `${platform}.json`);
  if (!fs.existsSync(file)) {
    return { fetched_at: null, stale: true, source: "bundled" };
  }
  try {
    const entry = JSON.parse(fs.readFileSync(file, "utf-8")) as { fetched_at: string };
    const age   = Date.now() - new Date(entry.fetched_at).getTime();
    const stale = age > TTL_MS;
    return {
      fetched_at: entry.fetched_at,
      stale,
      source: stale ? "bundled" : "cache",
    };
  } catch {
    return { fetched_at: null, stale: true, source: "bundled" };
  }
}

// ── Native lib map reader ─────────────────────────────────────────────────────

function readNativeLibMap(): NativeLibMapInfo {
  const mapPath = path.resolve(__dirname, "../../policies/native-lib-map.json");
  try {
    const db = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as {
      version: string;
      mappings: unknown[];
    };
    return { version: db.version, mapping_count: db.mappings.length };
  } catch {
    return { version: "unknown", mapping_count: 0 };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function getPolicyInfo(): PolicyInfoResult {
  const platforms = ["android", "ios"] as const;
  const result: Partial<PolicyInfoResult> = {};

  for (const platform of platforms) {
    const db   = loadPolicies(platform);
    const meta = readCacheMeta(platform);

    const cache_age_hours = meta.fetched_at
      ? Math.round((Date.now() - new Date(meta.fetched_at).getTime()) / 3_600_000 * 10) / 10
      : null;

    result[platform] = {
      version:      db.version,
      policy_count: db.policies.length,
      fetched_at:   meta.fetched_at,
      cache_age_hours,
      stale:        meta.stale,
      source:       meta.source,
      policies:     db.policies.map((p) => ({
        id:           p.id,
        name:         p.name,
        severity:     p.severity,
        auto_fixable: p.auto_fixable,
      })),
    };
  }

  return {
    android:         result.android!,
    ios:             result.ios!,
    native_lib_map:  readNativeLibMap(),
  };
}

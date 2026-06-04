"use strict";
/**
 * compliance_policy_info
 *
 * Returns metadata about every policy database currently loaded:
 * versions, policy counts, cache age, and source (remote cache vs bundled).
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
exports.getPolicyInfo = getPolicyInfo;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const loader_1 = require("../policies/loader");
// ── Cache metadata reader ─────────────────────────────────────────────────────
const CACHE_DIR = process.env.PLUGIN_CACHE_DIR ??
    path.join(os.homedir(), ".claude", "compliance-policy-cache");
const TTL_MS = 24 * 60 * 60 * 1000;
function readCacheMeta(platform) {
    const file = path.join(CACHE_DIR, `${platform}.json`);
    if (!fs.existsSync(file)) {
        return { fetched_at: null, stale: true, source: "bundled" };
    }
    try {
        const entry = JSON.parse(fs.readFileSync(file, "utf-8"));
        const age = Date.now() - new Date(entry.fetched_at).getTime();
        const stale = age > TTL_MS;
        return {
            fetched_at: entry.fetched_at,
            stale,
            source: stale ? "bundled" : "cache",
        };
    }
    catch {
        return { fetched_at: null, stale: true, source: "bundled" };
    }
}
// ── Native lib map reader ─────────────────────────────────────────────────────
function readNativeLibMap() {
    const mapPath = path.resolve(__dirname, "../../policies/native-lib-map.json");
    try {
        const db = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
        return { version: db.version, mapping_count: db.mappings.length };
    }
    catch {
        return { version: "unknown", mapping_count: 0 };
    }
}
// ── Main ──────────────────────────────────────────────────────────────────────
function getPolicyInfo() {
    const platforms = ["android", "ios"];
    const result = {};
    for (const platform of platforms) {
        const db = (0, loader_1.loadPolicies)(platform);
        const meta = readCacheMeta(platform);
        const cache_age_hours = meta.fetched_at
            ? Math.round((Date.now() - new Date(meta.fetched_at).getTime()) / 3_600_000 * 10) / 10
            : null;
        result[platform] = {
            version: db.version,
            policy_count: db.policies.length,
            fetched_at: meta.fetched_at,
            cache_age_hours,
            stale: meta.stale,
            source: meta.source,
            policies: db.policies.map((p) => ({
                id: p.id,
                name: p.name,
                severity: p.severity,
                auto_fixable: p.auto_fixable,
            })),
        };
    }
    return {
        android: result.android,
        ios: result.ios,
        native_lib_map: readNativeLibMap(),
    };
}
//# sourceMappingURL=policy-info.js.map
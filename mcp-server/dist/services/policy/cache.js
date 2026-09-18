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
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.isCacheStale = isCacheStale;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const CACHE_DIR = process.env.PLUGIN_CACHE_DIR ??
    path.join(os.homedir(), ".claude", "compliance-policy-cache");
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
function cacheFile(platform) {
    return path.join(CACHE_DIR, `${platform}.json`);
}
function readCache(platform) {
    const file = cacheFile(platform);
    if (!fs.existsSync(file))
        return null;
    try {
        const entry = JSON.parse(fs.readFileSync(file, "utf-8"));
        const age = Date.now() - new Date(entry.fetched_at).getTime();
        if (age > TTL_MS)
            return null;
        return entry.data;
    }
    catch {
        return null;
    }
}
function writeCache(platform, data) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry = { fetched_at: new Date().toISOString(), data };
    const tmp = cacheFile(platform) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), "utf-8");
    fs.renameSync(tmp, cacheFile(platform));
}
function isCacheStale(platform) {
    const file = cacheFile(platform);
    if (!fs.existsSync(file))
        return true;
    try {
        const entry = JSON.parse(fs.readFileSync(file, "utf-8"));
        return Date.now() - new Date(entry.fetched_at).getTime() > TTL_MS;
    }
    catch {
        return true;
    }
}
//# sourceMappingURL=cache.js.map
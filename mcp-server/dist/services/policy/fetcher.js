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
exports.refreshPolicies = refreshPolicies;
const https = __importStar(require("https"));
const cache_1 = require("./cache");
const DEFAULT_BASE_URL = process.env.POLICIES_REMOTE_URL ??
    "https://raw.githubusercontent.com/99x/claude-rn-compliance/main/mcp-server/policies";
async function refreshPolicies(platforms, remoteUrl) {
    const base = remoteUrl ?? DEFAULT_BASE_URL;
    const changelog = [];
    let anyUpdated = false;
    let latestVersion = "unknown";
    for (const platform of platforms) {
        const url = `${base}/${platform}.json`;
        try {
            const fresh = await fetchJson(url);
            const existing = (0, cache_1.readCache)(platform);
            if (!existing || fresh.version !== existing.version) {
                (0, cache_1.writeCache)(platform, fresh);
                changelog.push(`${platform}: ${existing?.version ?? "none"} → ${fresh.version}`);
                anyUpdated = true;
            }
            latestVersion = fresh.version;
        }
        catch (err) {
            changelog.push(`${platform}: fetch failed — ${err.message}`);
        }
    }
    return { updated: anyUpdated, version: latestVersion, changelog };
}
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds
const MAX_BODY_BYTES = 512_000; // 512 KB — policy files are small
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            // Follow a single redirect (301/302/307/308)
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                req.destroy();
                fetchJson(res.headers.location).then(resolve, reject);
                return;
            }
            if (status !== 200) {
                req.destroy();
                reject(new Error(`HTTP ${status}`));
                return;
            }
            let body = "";
            let bytes = 0;
            res.on("data", (chunk) => {
                bytes += chunk.length;
                if (bytes > MAX_BODY_BYTES) {
                    req.destroy();
                    reject(new Error(`Response too large (> ${MAX_BODY_BYTES} bytes)`));
                    return;
                }
                body += chunk.toString("utf-8");
            });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch {
                    reject(new Error("Invalid JSON from remote"));
                }
            });
        });
        req.setTimeout(FETCH_TIMEOUT_MS, () => {
            req.destroy();
            reject(new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`));
        });
        req.on("error", reject);
    });
}
//# sourceMappingURL=fetcher.js.map
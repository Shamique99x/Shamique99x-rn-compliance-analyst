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
exports.loadPolicies = loadPolicies;
exports.loadAllPolicies = loadAllPolicies;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cache_1 = require("./cache");
const BUNDLED_DIR = path.join(__dirname, "../../policies");
function loadPolicies(platform) {
    const bundled = loadBundled(platform);
    const cached = (0, cache_1.readCache)(platform);
    if (cached && isNewer(cached.version, bundled.version)) {
        return cached;
    }
    return bundled;
}
function loadAllPolicies() {
    return ["android", "ios"].map(loadPolicies);
}
function loadBundled(platform) {
    const file = path.join(BUNDLED_DIR, `${platform}.json`);
    try {
        const raw = fs.readFileSync(file, "utf-8");
        return JSON.parse(raw);
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT") {
            throw new Error(`Bundled policy file not found: ${file}\n` +
                `This usually means the plugin was not installed correctly or the dist/ folder is missing.\n` +
                `Re-install the plugin with: claude plugin install <path-to-plugin>`);
        }
        throw err;
    }
}
function isNewer(a, b) {
    return a.localeCompare(b, undefined, { numeric: true }) > 0;
}
//# sourceMappingURL=loader.js.map
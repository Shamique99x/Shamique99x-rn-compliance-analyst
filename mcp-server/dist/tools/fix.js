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
exports.complianceFix = complianceFix;
const path = __importStar(require("path"));
const loader_1 = require("../services/policy/loader");
const fix_runner_1 = require("../engine/fix-runner");
/**
 * Apply fixes for a given list of violation IDs.
 *
 * The engine reads the `fix` field from the policy JSON at runtime, so adding a
 * new policy to the JSON (or refreshing from the remote cache) automatically
 * makes it fixable — no code changes needed.
 *
 * Special cases retained:
 *   ios-privacy-* violations are de-duplicated: running fixPrivacyManifest once
 *   covers both "file exists" and "required reason APIs" policies.  The engine's
 *   `privacy_manifest_append_apis` fix type delegates to the same fixer, so the
 *   de-duplication guard below prevents writing the manifest twice in fix-all mode.
 */
async function complianceFix(projectPath, violationIds) {
    const absPath = path.resolve(projectPath);
    const applied = [];
    const skipped = [];
    // Merge all platform policy DBs into one lookup map  id → fix
    const policyMap = buildPolicyMap();
    // De-duplication: some violations share a fixer group (privacy manifest).
    // Track which "fixer group" keys have already been executed.
    const seenFixerGroups = new Set();
    for (const id of violationIds) {
        const policy = policyMap.get(id);
        if (!policy || !policy.fix) {
            skipped.push(id);
            continue;
        }
        // Group key: ios-privacy-* share a single fixer run
        const groupKey = FIXER_GROUP[id] ?? id;
        if (seenFixerGroups.has(groupKey))
            continue;
        seenFixerGroups.add(groupKey);
        const result = await (0, fix_runner_1.runFix)(absPath, id, policy.fix);
        applied.push(result);
    }
    const allBackups = applied.flatMap((r) => r.changes.map((c) => c.backup_path).filter(Boolean));
    return { applied, skipped, backup_paths: allBackups };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Both ios-privacy-* policies trigger `fixPrivacyManifest`, which handles both
 * file creation and API-entry injection in a single pass.
 * Running it twice would write the manifest file twice (needlessly).
 */
const FIXER_GROUP = {
    "ios-privacy-manifest-exists": "ios-privacy-fixer",
    "ios-privacy-required-reason-apis": "ios-privacy-fixer",
};
function buildPolicyMap() {
    const map = new Map();
    for (const platform of ["android", "ios"]) {
        const db = (0, loader_1.loadPolicies)(platform);
        for (const policy of db.policies) {
            map.set(policy.id, { fix: policy.fix });
        }
    }
    return map;
}
//# sourceMappingURL=fix.js.map
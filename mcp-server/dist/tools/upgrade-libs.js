"use strict";
/**
 * compliance_upgrade_libraries
 *
 * Detects the project's package manager (npm / yarn / pnpm / bun) from its
 * lock file, then runs a single install command to upgrade all requested
 * packages to their minimum 16 KB-compliant versions.
 *
 * The skill always asks the user for permission before calling this tool.
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
exports.detectPackageManager = detectPackageManager;
exports.upgradeLibraries = upgradeLibraries;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// ── Package manager detection ─────────────────────────────────────────────────
const LOCK_FILES = [
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
];
function detectPackageManager(projectPath) {
    for (const [file, pm] of LOCK_FILES) {
        if (fs.existsSync(path.join(projectPath, file)))
            return pm;
    }
    return "npm"; // safe default
}
function buildInstallCommand(pm, packages) {
    // e.g. ["react-native-reanimated@3.6.0", "react-native-screens@3.29.0"]
    const specs = packages.map((p) => `${p.name}@${p.min_version}`);
    switch (pm) {
        case "yarn": return { bin: "yarn", args: ["add", ...specs] };
        case "pnpm": return { bin: "pnpm", args: ["add", ...specs] };
        case "bun": return { bin: "bun", args: ["add", ...specs] };
        default: return { bin: "npm", args: ["install", "--save", ...specs] };
    }
}
// ── Core ──────────────────────────────────────────────────────────────────────
function upgradeLibraries(projectPath, upgrades) {
    const absPath = path.resolve(projectPath);
    if (!fs.existsSync(absPath)) {
        return {
            package_manager: "npm",
            command: "",
            success: false,
            output: "",
            packages: [],
            error: `Project path not found: ${absPath}`,
        };
    }
    // Validate package names and versions to guard against LLM-generated malicious input.
    // A malformed name like "evil; rm -rf /" or a local-path version "../../../evil"
    // could trigger arbitrary scripts via postinstall hooks.
    const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
    const SEMVER_RE = /^\d+\.\d+\.\d+/; // must start with X.Y.Z
    const actionable = upgrades.filter((u) => {
        if (!u.min_version || u.min_version === "unknown")
            return false;
        if (!NPM_NAME_RE.test(u.name)) {
            console.error(`[compliance] Skipping unsafe package name: ${u.name}`);
            return false;
        }
        if (!SEMVER_RE.test(u.min_version)) {
            console.error(`[compliance] Skipping invalid version for ${u.name}: ${u.min_version}`);
            return false;
        }
        return true;
    });
    if (actionable.length === 0) {
        return {
            package_manager: detectPackageManager(absPath),
            command: "",
            success: true,
            output: "No actionable upgrades — all requested packages have unknown minimum versions.",
            packages: [],
        };
    }
    const pm = detectPackageManager(absPath);
    const { bin, args } = buildInstallCommand(pm, actionable);
    const commandStr = `${bin} ${args.join(" ")}`;
    const result = (0, child_process_1.spawnSync)(bin, args, {
        cwd: absPath,
        encoding: "utf-8",
        // Give the install up to 5 minutes — network + extraction can be slow
        timeout: 5 * 60 * 1000,
        // Merge stdout and stderr so we capture everything
        stdio: ["ignore", "pipe", "pipe"],
    });
    const output = [result.stdout ?? "", result.stderr ?? ""]
        .filter(Boolean)
        .join("\n")
        .trim();
    const success = result.status === 0 && !result.error;
    return {
        package_manager: pm,
        command: commandStr,
        success,
        output,
        packages: actionable.map((u) => ({
            name: u.name,
            requested_version: u.min_version,
            // Individual success is inferred from the overall run; if the whole
            // command failed we mark all as failed
            success,
        })),
        error: result.error?.message ?? (success ? undefined : `Exit code ${result.status}`),
    };
}
//# sourceMappingURL=upgrade-libs.js.map
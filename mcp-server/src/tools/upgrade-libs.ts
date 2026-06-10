/**
 * compliance_upgrade_libraries
 *
 * Detects the project's package manager (npm / yarn / pnpm / bun) from its
 * lock file, then runs a single install command to upgrade all requested
 * packages to their minimum 16 KB-compliant versions.
 *
 * The skill always asks the user for permission before calling this tool.
 */

import * as fs   from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export interface UpgradeRequest {
  /** npm package name */
  name: string;
  /** Exact or minimum version to install, e.g. "3.6.0" */
  min_version: string;
}

export interface UpgradeResult {
  package_manager: PackageManager;
  /** The full shell command that was run */
  command: string;
  success: boolean;
  /** stdout + stderr combined */
  output: string;
  /** Per-package breakdown derived from the single install run */
  packages: Array<{
    name: string;
    requested_version: string;
    success: boolean;
  }>;
  error?: string;
}

// ── Package manager detection ─────────────────────────────────────────────────

const LOCK_FILES: Array<[string, PackageManager]> = [
  ["bun.lockb",        "bun"],
  ["bun.lock",         "bun"],
  ["pnpm-lock.yaml",   "pnpm"],
  ["yarn.lock",        "yarn"],
  ["package-lock.json","npm"],
];

export function detectPackageManager(projectPath: string): PackageManager {
  for (const [file, pm] of LOCK_FILES) {
    if (fs.existsSync(path.join(projectPath, file))) return pm;
  }
  return "npm"; // safe default
}

function buildInstallCommand(
  pm: PackageManager,
  packages: UpgradeRequest[]
): { bin: string; args: string[] } {
  // e.g. ["react-native-reanimated@3.6.0", "react-native-screens@3.29.0"]
  const specs = packages.map((p) => `${p.name}@${p.min_version}`);

  switch (pm) {
    case "yarn": return { bin: "yarn", args: ["add", ...specs] };
    case "pnpm": return { bin: "pnpm", args: ["add", ...specs] };
    case "bun":  return { bin: "bun",  args: ["add", ...specs] };
    default:     return { bin: "npm",  args: ["install", "--save", ...specs] };
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

export function upgradeLibraries(
  projectPath: string,
  upgrades: UpgradeRequest[]
): UpgradeResult {
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
  const SEMVER_RE   = /^\d+\.\d+\.\d+/; // must start with X.Y.Z

  const actionable = upgrades.filter((u) => {
    if (!u.min_version || u.min_version === "unknown") return false;
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

  const result = spawnSync(bin, args, {
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

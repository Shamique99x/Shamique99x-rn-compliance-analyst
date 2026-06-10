/**
 * compliance_upgrade_libraries
 *
 * Detects the project's package manager (npm / yarn / pnpm / bun) from its
 * lock file, then runs a single install command to upgrade all requested
 * packages to their minimum 16 KB-compliant versions.
 *
 * The skill always asks the user for permission before calling this tool.
 */
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
export declare function detectPackageManager(projectPath: string): PackageManager;
export declare function upgradeLibraries(projectPath: string, upgrades: UpgradeRequest[]): UpgradeResult;
//# sourceMappingURL=upgrade-libs.d.ts.map
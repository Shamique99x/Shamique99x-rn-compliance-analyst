import * as path from "path";
import * as fs from "fs";
import semver from "semver";
import { Platform, ScanResult, Violation, LibUpgrade, ApkInspectionResult } from "../types";
import { loadPolicies } from "../policies/loader";
import { scanPageSize } from "../scanners/android/page-size";
import { scanSdkVersions } from "../scanners/android/sdk-versions";
import { scanPrivacyManifest } from "../scanners/ios/privacy-manifest";
import { scanDeploymentTarget } from "../scanners/ios/deployment-target";
import { findApk, inspectApk } from "../scanners/android/apk-inspector";
import { resolveUpgrades } from "../scanners/android/lib-mapper";

export async function complianceScan(
  projectPath: string,
  platforms: Platform[] = ["android", "ios"]
): Promise<ScanResult> {
  const absPath = path.resolve(projectPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Project path not found: ${absPath}`);
  }

  const violations: Violation[] = [];

  if (platforms.includes("android")) {
    violations.push(...scanPageSize(absPath));
    violations.push(...scanSdkVersions(absPath));
  }

  if (platforms.includes("ios")) {
    violations.push(...(await scanPrivacyManifest(absPath)));
    violations.push(...(await scanDeploymentTarget(absPath)));
  }

  const libraryUpgrades: LibUpgrade[] = collectLibraryUpgrades(absPath, violations, platforms);
  // Report the version of the first requested platform's policy DB
  const policiesVersion = loadPolicies(platforms[0] ?? "android").version;

  // APK-level 16 KB inspection — runs only when a built APK exists.
  // This catches misaligned third-party .so files that build-config checks miss.
  let apk_inspection: ApkInspectionResult | undefined;
  if (platforms.includes("android")) {
    const apkPath = findApk(absPath);
    if (apkPath) {
      apk_inspection = inspectApk(apkPath);

      // Promote APK non-compliance to violations so it surfaces in the normal report
      if (!apk_inspection.compliant && !apk_inspection.error) {
        const byLibrary = apk_inspection.non_compliant
          .map((lib) => `  • ${lib.abi}/${lib.name}\n${lib.issues.map((i) => `      – ${i}`).join("\n")}`)
          .join("\n");

        violations.push({
          policy_id: "android-16kb-apk-verified",
          policy_name: "16 KB Page Size — APK Verification",
          platform: "android",
          severity: "error",
          auto_fixable: false,
          description:
            "One or more native libraries in the built APK are not 16 KB page-size " +
            "compliant. This will cause crashes on Android 15+ devices with 16 KB pages. " +
            "Build-config fixes alone are not enough — the offending libraries must be " +
            "recompiled or updated to a version that ships with 16 KB-aligned binaries.",
          docs_url: "https://developer.android.com/guide/practices/page-sizes",
          details:
            `APK inspected: ${apkPath}\n` +
            `Libraries checked: ${apk_inspection.libraries_checked}\n` +
            `Non-compliant (${apk_inspection.non_compliant.length}):\n${byLibrary}`,
          affected_files: apk_inspection.non_compliant.map(
            (lib) => `lib/${lib.abi}/${lib.name}`
          ),
        });

        // Resolve which npm packages need upgrading and merge into libraryUpgrades
        const apkUpgrades = await resolveUpgrades(apk_inspection.non_compliant, absPath);
        for (const upgrade of apkUpgrades) {
          // Don't duplicate if the package is already flagged by a build-config check
          if (!libraryUpgrades.some((u) => u.name === upgrade.name)) {
            libraryUpgrades.push(upgrade);
          }
        }
      }
    }
  }

  return {
    violations,
    library_upgrades_required: libraryUpgrades,
    scan_time: new Date().toISOString(),
    policies_version: policiesVersion,
    apk_inspection,
  };
}

function collectLibraryUpgrades(
  projectPath: string,
  violations: Violation[],
  platforms: Platform[]
): LibUpgrade[] {
  const pkgFile = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgFile)) return [];

  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const upgradeMap = new Map<string, LibUpgrade>();

  for (const platform of platforms) {
    const db = loadPolicies(platform);
    for (const policy of db.policies) {
      const hasViolation = violations.some((v) => v.policy_id === policy.id);
      if (!hasViolation) continue;

      for (const req of policy.library_requirements) {
        const current = allDeps[req.name]?.replace(/^[\^~>=<]/, "");
        if (!current) continue;
        const coerced = semver.coerce(current);
        if (coerced && semver.lt(coerced, req.min_version)) {
          const existing = upgradeMap.get(req.name);
          if (existing) {
            if (!existing.required_by_policy_ids.includes(policy.id)) {
              existing.required_by_policy_ids.push(policy.id);
            }
          } else {
            upgradeMap.set(req.name, {
              name: req.name,
              current_version: current,
              min_version: req.min_version,
              reason: req.reason,
              required_by_policy_ids: [policy.id],
            });
          }
        }
      }
    }
  }

  return [...upgradeMap.values()];
}

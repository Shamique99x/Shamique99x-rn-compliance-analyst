/**
 * compliance_inspect_apk
 *
 * Runs the APK-level 16 KB page-size inspection on a specific APK file
 * (or auto-discovers one) and returns the full native library report
 * plus package upgrade suggestions.
 */

import * as fs   from "fs";
import * as path from "path";
import { findApk, inspectApk, ApkInspectionResult } from "../scanners/android/apk-inspector";
import { resolveUpgrades, ApkLibUpgrade }            from "../scanners/android/lib-mapper";

export interface InspectApkResult {
  inspection: ApkInspectionResult;
  upgrades: ApkLibUpgrade[];
}

/**
 * @param projectPath  Root of the RN project (used for APK discovery + package.json lookup)
 * @param apkPath      Explicit path to an APK file. If omitted, auto-discovers.
 * @param variant      "debug" | "release" — hint for auto-discovery when apkPath is omitted
 */
export async function inspectApkTool(
  projectPath: string,
  apkPath?: string,
  variant?: string
): Promise<InspectApkResult> {
  const absProject = path.resolve(projectPath);

  // Resolve the APK path
  let resolvedApk: string | null = null;

  if (apkPath) {
    // Caller passed an explicit path
    resolvedApk = path.resolve(apkPath);
    if (!fs.existsSync(resolvedApk)) {
      return {
        inspection: {
          apk_path: resolvedApk,
          libraries_checked: 0,
          non_compliant: [],
          compliant: false,
          error: `APK not found at: ${resolvedApk}`,
        },
        upgrades: [],
      };
    }
  } else {
    // Auto-discover, with optional variant hint
    resolvedApk = findApkByVariant(absProject, variant);
    if (!resolvedApk) {
      return {
        inspection: {
          apk_path: "",
          libraries_checked: 0,
          non_compliant: [],
          compliant: false,
          error:
            "No APK found in android/app/build/outputs/apk/. " +
            "Build one first with: cd android && ./gradlew assembleDebug",
        },
        upgrades: [],
      };
    }
  }

  const inspection = inspectApk(resolvedApk);

  const upgrades =
    inspection.non_compliant.length > 0
      ? await resolveUpgrades(inspection.non_compliant, absProject)
      : [];

  return { inspection, upgrades };
}

// ── APK discovery with optional variant hint ──────────────────────────────────

function findApkByVariant(projectPath: string, variant?: string): string | null {
  const outputDir = path.join(projectPath, "android/app/build/outputs/apk");
  if (!fs.existsSync(outputDir)) return null;

  // If a variant hint was given, check that subdirectory first
  if (variant) {
    const hintDir = path.join(outputDir, variant);
    if (fs.existsSync(hintDir)) {
      for (const file of fs.readdirSync(hintDir)) {
        if (file.endsWith(".apk")) return path.join(hintDir, file);
      }
    }
  }

  // Fall back to the generic finder
  return findApk(projectPath);
}

import * as fs from "fs";
import * as path from "path";
import semver from "semver";
import { Violation } from "../../types";

const MIN_RN_VERSION_FOR_16KB = "0.74.0";

export function scanPageSize(projectPath: string): Violation[] {
  const propsFile = path.join(projectPath, "android", "gradle.properties");
  const buildFile = path.join(projectPath, "android", "app", "build.gradle");
  const cmakeFile = path.join(projectPath, "android", "app", "CMakeLists.txt");

  const hasProjectNativeCode = fs.existsSync(cmakeFile) || hasNativeBuildBlock(buildFile);
  const rnVersion = readRNVersion(projectPath);
  const rnTooOld = rnVersion !== null && semver.lt(rnVersion, MIN_RN_VERSION_FOR_16KB);

  // Skip entirely if no native code at all and RN version is fine
  if (!hasProjectNativeCode && !rnTooOld) return [];

  const affectedFiles: string[] = [];
  let uncompressedLibsOk = false;
  let cmakeFlagOk = false;
  let gradleCmakeArgOk = false;

  if (fs.existsSync(propsFile)) {
    const content = fs.readFileSync(propsFile, "utf-8");
    uncompressedLibsOk = /^\s*android\.bundle\.enableUncompressedNativeLibs\s*=\s*true/m.test(content);
    if (!uncompressedLibsOk) affectedFiles.push("android/gradle.properties");
  } else {
    affectedFiles.push("android/gradle.properties");
  }

  if (hasProjectNativeCode) {
    if (fs.existsSync(buildFile)) {
      const content = fs.readFileSync(buildFile, "utf-8");
      gradleCmakeArgOk = content.includes("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON");
      if (!gradleCmakeArgOk) affectedFiles.push("android/app/build.gradle");
    }

    if (fs.existsSync(cmakeFile)) {
      const content = fs.readFileSync(cmakeFile, "utf-8");
      cmakeFlagOk = content.includes("-Wl,-z,max-page-size=16384");
      if (!cmakeFlagOk) affectedFiles.push("android/app/CMakeLists.txt");
    }
  }

  const nativeCodeCompliant = !hasProjectNativeCode || (gradleCmakeArgOk || cmakeFlagOk);
  const isCompliant = uncompressedLibsOk && nativeCodeCompliant && !rnTooOld;

  if (isCompliant) return [];

  return [
    {
      policy_id: "android-16kb-page-size",
      policy_name: "16 KB Page Size Alignment",
      platform: "android",
      severity: "error",
      auto_fixable: true,
      description:
        "Android 15 requires all native .so libraries to be aligned to 16 KB memory pages. Apps not meeting this requirement will crash on Pixel 8 and newer devices running Android 15.",
      docs_url: "https://developer.android.com/guide/practices/page-sizes",
      details: buildDetails({ uncompressedLibsOk, gradleCmakeArgOk, cmakeFlagOk, rnTooOld, rnVersion, hasProjectNativeCode }),
      affected_files: [...new Set(affectedFiles)],
    },
  ];
}

function hasNativeBuildBlock(buildFile: string): boolean {
  if (!fs.existsSync(buildFile)) return false;
  return /externalNativeBuild|ndkBuild|cmake\s*\{/.test(fs.readFileSync(buildFile, "utf-8"));
}

function readRNVersion(projectPath: string): string | null {
  const pkgFile = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgFile)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
    const raw: string | undefined = pkg.dependencies?.["react-native"] ?? pkg.devDependencies?.["react-native"];
    if (!raw) return null;
    const coerced = semver.coerce(raw);
    return coerced ? coerced.version : null;
  } catch {
    return null;
  }
}

function buildDetails(flags: {
  uncompressedLibsOk: boolean;
  gradleCmakeArgOk: boolean;
  cmakeFlagOk: boolean;
  rnTooOld: boolean;
  rnVersion: string | null;
  hasProjectNativeCode: boolean;
}): string {
  const missing: string[] = [];
  if (flags.rnTooOld)
    missing.push(
      `react-native ${flags.rnVersion} ships prebuilt .so files not aligned to 16 KB — upgrade to >= ${MIN_RN_VERSION_FOR_16KB}`
    );
  if (!flags.uncompressedLibsOk)
    missing.push("android.bundle.enableUncompressedNativeLibs=true missing from gradle.properties");
  // Only flag cmake arg when the project actually has C/C++ native code
  if (flags.hasProjectNativeCode && !flags.gradleCmakeArgOk && !flags.cmakeFlagOk)
    missing.push("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON missing from build.gradle cmake arguments");
  return missing.join("; ");
}

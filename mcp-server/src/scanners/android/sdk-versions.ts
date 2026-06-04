import * as fs from "fs";
import * as path from "path";
import semver from "semver";
import { Violation } from "../../types";

const MIN_TARGET_SDK = 35;
const MIN_COMPILE_SDK = 35;
const MIN_AGP = "8.3.0";
const MIN_GRADLE = "8.6";
const TARGET_AGP = "8.3.2";
const TARGET_GRADLE = "8.6";

export function scanSdkVersions(projectPath: string): Violation[] {
  const violations: Violation[] = [];

  violations.push(...checkSdkLevels(projectPath));
  violations.push(...checkAgpVersion(projectPath));
  violations.push(...checkGradleWrapper(projectPath));

  return violations;
}

function checkSdkLevels(projectPath: string): Violation[] {
  const appBuildFile = path.join(projectPath, "android", "app", "build.gradle");
  const rootBuildFile = path.join(projectPath, "android", "build.gradle");

  if (!fs.existsSync(appBuildFile)) return [];

  const appContent = fs.readFileSync(appBuildFile, "utf-8");

  // Read ext properties from root build.gradle as fallback for rootProject.ext.* references
  const rootExtProps = fs.existsSync(rootBuildFile)
    ? extractExtBlock(fs.readFileSync(rootBuildFile, "utf-8"))
    : {};

  const targetSdk = resolveIntProperty(appContent, "targetSdkVersion", rootExtProps);
  const compileSdk = resolveIntProperty(appContent, "compileSdkVersion", rootExtProps);

  const missing: string[] = [];

  if (targetSdk !== null && targetSdk < MIN_TARGET_SDK)
    missing.push(`targetSdkVersion is ${targetSdk}, must be >= ${MIN_TARGET_SDK}`);
  else if (targetSdk === null)
    missing.push("targetSdkVersion not found in app/build.gradle or android/build.gradle ext block");

  if (compileSdk !== null && compileSdk < MIN_COMPILE_SDK)
    missing.push(`compileSdkVersion is ${compileSdk}, must be >= ${MIN_COMPILE_SDK}`);
  else if (compileSdk === null)
    missing.push("compileSdkVersion not found in app/build.gradle or android/build.gradle ext block");

  if (missing.length === 0) return [];

  return [
    {
      policy_id: "android-target-sdk",
      policy_name: "Target & Compile SDK Version",
      platform: "android",
      severity: "error",
      auto_fixable: true,
      description: `Google Play requires targetSdkVersion >= ${MIN_TARGET_SDK} for all new submissions as of August 2025.`,
      docs_url: "https://developer.android.com/google/play/requirements/target-sdk",
      details: missing.join("; "),
      affected_files: resolveAffectedFile(appContent, rootExtProps, rootBuildFile, appBuildFile, projectPath),
    },
  ];
}

function checkAgpVersion(projectPath: string): Violation[] {
  const file = path.join(projectPath, "android", "build.gradle");
  if (!fs.existsSync(file)) return [];

  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(/com\.android\.tools\.build:gradle:(\d+\.\d+\.\d+)/);
  if (!match) return [];

  const current = match[1];
  if (!semver.lt(current, MIN_AGP)) return [];

  return [
    {
      policy_id: "android-agp-version",
      policy_name: "Android Gradle Plugin Version",
      platform: "android",
      severity: "warning",
      auto_fixable: true,
      description: `AGP ${MIN_AGP}+ is required for 16 KB page size and API ${MIN_TARGET_SDK} support.`,
      docs_url: "https://developer.android.com/build/releases/gradle-plugin",
      details: `AGP is ${current}, must be >= ${MIN_AGP}. Will update to ${TARGET_AGP}.`,
      affected_files: ["android/build.gradle"],
    },
  ];
}

function checkGradleWrapper(projectPath: string): Violation[] {
  const file = path.join(
    projectPath,
    "android",
    "gradle",
    "wrapper",
    "gradle-wrapper.properties"
  );
  if (!fs.existsSync(file)) return [];

  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(/gradle-(\d+\.\d+(?:\.\d+)?)-/);
  if (!match) return [];

  const current = match[1];
  const coercedCurrent = semver.coerce(current);
  const coercedMin     = semver.coerce(MIN_GRADLE);
  if (!coercedCurrent || !coercedMin) return []; // malformed version string — skip
  if (!semver.lt(coercedCurrent, coercedMin)) return [];

  return [
    {
      policy_id: "android-gradle-wrapper",
      policy_name: "Gradle Wrapper Version",
      platform: "android",
      severity: "warning",
      auto_fixable: true,
      description: `Gradle ${MIN_GRADLE}+ is required to work with AGP ${MIN_AGP}+.`,
      docs_url: "https://developer.android.com/build/releases/gradle-plugin#updating-gradle",
      details: `Gradle wrapper is ${current}, must be >= ${MIN_GRADLE}. Will update to ${TARGET_GRADLE}.`,
      affected_files: ["android/gradle/wrapper/gradle-wrapper.properties"],
    },
  ];
}

// Reads integer property directly from content, or looks up ext block if value is a rootProject.ext.* reference
function resolveIntProperty(
  appContent: string,
  property: string,
  rootExtProps: Record<string, number>
): number | null {
  // Direct integer value: compileSdkVersion 35 / compileSdkVersion = 35
  const directMatch = appContent.match(new RegExp(`${property}\\s*(?:[=:\\s])\\s*(\\d+)`));
  if (directMatch) return parseInt(directMatch[1], 10);

  // rootProject.ext.* reference: compileSdkVersion rootProject.ext.compileSdkVersion
  const extRefMatch = appContent.match(
    new RegExp(`${property}\\s+rootProject\\.ext\\.(\\w+)`)
  );
  if (extRefMatch) {
    const extKey = extRefMatch[1];
    return rootExtProps[extKey] ?? null;
  }

  return null;
}

// Extracts key=value integer pairs from the ext { } block in root build.gradle
function extractExtBlock(rootContent: string): Record<string, number> {
  const result: Record<string, number> = {};

  // Find the last ext { } block (the one in the top-level, not inside subprojects)
  // We look for the standalone `ext {` that isn't inside subprojects { }
  const extBlockMatch = rootContent.match(/^ext\s*\{([^}]+)\}/m);
  if (!extBlockMatch) return result;

  const block = extBlockMatch[1];
  const lines = block.split("\n");
  for (const line of lines) {
    const kv = line.match(/(\w+)\s*=\s*(\d+)/);
    if (kv) result[kv[1]] = parseInt(kv[2], 10);
  }

  return result;
}

function resolveAffectedFile(
  appContent: string,
  rootExtProps: Record<string, number>,
  rootBuildFile: string,
  appBuildFile: string,
  projectPath: string
): string[] {
  const files: string[] = [];

  const usesExtRef =
    /(?:targetSdkVersion|compileSdkVersion)\s+rootProject\.ext\./.test(appContent);

  if (usesExtRef && Object.keys(rootExtProps).length > 0) {
    files.push(path.relative(projectPath, rootBuildFile).replace(/\\/g, "/"));
  } else {
    files.push(path.relative(projectPath, appBuildFile).replace(/\\/g, "/"));
  }

  return files;
}

import * as fs from "fs";
import * as path from "path";
import { FixResult } from "../../types";
import { backupAndWrite } from "../utils";

const TARGET_SDK = 35;
const TARGET_AGP = "8.3.2";
const TARGET_GRADLE_URL =
  "https\\://services.gradle.org/distributions/gradle-8.6-all.zip";

export function fixSdkVersions(projectPath: string): FixResult[] {
  // Do NOT filter here — callers rely on the fixed order [0]=targetSdk, [1]=agp, [2]=wrapper.
  // Results with no changes are kept so indices never shift.
  return [
    fixAppBuildGradle(projectPath),
    fixRootBuildGradle(projectPath),
    fixGradleWrapper(projectPath),
  ];
}

function fixAppBuildGradle(projectPath: string): FixResult {
  const file = path.join(projectPath, "android", "app", "build.gradle");
  const changes: FixResult["changes"] = [];

  if (!fs.existsSync(file)) {
    return { violation_id: "android-target-sdk", success: false, changes, error: "android/app/build.gradle not found" };
  }

  let content = fs.readFileSync(file, "utf-8");
  let modified = false;

  for (const prop of ["targetSdkVersion", "compileSdkVersion"] as const) {
    // Match Groovy DSL formats: `targetSdkVersion 35`, `targetSdkVersion = 35`, `targetSdkVersion: 35`
    const regex = new RegExp(`(${prop}\\s*(?:[=:\\s])\\s*)(\\d+)`);
    const match = content.match(regex);
    if (match && parseInt(match[2], 10) < TARGET_SDK) {
      content = content.replace(regex, `$1${TARGET_SDK}`);
      modified = true;
    }
  }

  if (modified) {
    const backup = backupAndWrite(file, content);
    changes.push({
      file: "android/app/build.gradle",
      description: `Bumped compileSdkVersion and targetSdkVersion to ${TARGET_SDK}`,
      backup_path: backup,
    });
  }

  return { violation_id: "android-target-sdk", success: true, changes };
}

function fixRootBuildGradle(projectPath: string): FixResult {
  const file = path.join(projectPath, "android", "build.gradle");
  const changes: FixResult["changes"] = [];

  if (!fs.existsSync(file)) {
    return { violation_id: "android-agp-version", success: true, changes };
  }

  let content = fs.readFileSync(file, "utf-8");
  const agpRegex = /(com\.android\.tools\.build:gradle:)(\d+\.\d+\.\d+)/;
  const match = content.match(agpRegex);

  if (match && isOlderThan(match[2], TARGET_AGP)) {
    content = content.replace(agpRegex, `$1${TARGET_AGP}`);
    const backup = backupAndWrite(file, content);
    changes.push({
      file: "android/build.gradle",
      description: `Updated AGP from ${match[2]} to ${TARGET_AGP}`,
      backup_path: backup,
    });
  }

  return { violation_id: "android-agp-version", success: true, changes };
}

function fixGradleWrapper(projectPath: string): FixResult {
  const file = path.join(
    projectPath,
    "android",
    "gradle",
    "wrapper",
    "gradle-wrapper.properties"
  );
  const changes: FixResult["changes"] = [];

  if (!fs.existsSync(file)) {
    return { violation_id: "android-gradle-wrapper", success: true, changes };
  }

  let content = fs.readFileSync(file, "utf-8");
  const urlRegex = /(distributionUrl\s*=\s*).+/;
  const match = content.match(/gradle-(\d+\.\d+(?:\.\d+)?)-/);

  if (match && isOlderThan(match[1], "8.6")) {
    content = content.replace(urlRegex, `$1${TARGET_GRADLE_URL}`);
    const backup = backupAndWrite(file, content);
    changes.push({
      file: "android/gradle/wrapper/gradle-wrapper.properties",
      description: `Updated Gradle wrapper from ${match[1]} to 8.6`,
      backup_path: backup,
    });
  }

  return { violation_id: "android-gradle-wrapper", success: true, changes };
}

function isOlderThan(current: string, target: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [ca, cb, cc = 0] = parse(current);
  const [ta, tb, tc = 0] = parse(target);
  if (ca !== ta) return ca < ta;
  if (cb !== tb) return cb < tb;
  return cc < tc;
}

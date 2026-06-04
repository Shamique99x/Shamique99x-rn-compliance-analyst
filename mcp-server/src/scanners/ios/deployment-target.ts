import * as fs from "fs";
import * as path from "path";
import semver from "semver";
import { Violation } from "../../types";

const MIN_IOS_VERSION = "15.1";

function findPbxproj(iosDir: string): string | null {
  try {
    for (const entry of fs.readdirSync(iosDir)) {
      if (entry.endsWith(".xcodeproj")) {
        const candidate = path.join(iosDir, entry, "project.pbxproj");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export async function scanDeploymentTarget(projectPath: string): Promise<Violation[]> {
  const violations: Violation[] = [];

  violations.push(...checkPodfile(projectPath));
  violations.push(...(await checkPbxproj(projectPath)));
  violations.push(...checkXcodeVersion(projectPath));

  return violations;
}

function checkPodfile(projectPath: string): Violation[] {
  const file = path.join(projectPath, "ios", "Podfile");
  if (!fs.existsSync(file)) return [];

  const content = fs.readFileSync(file, "utf-8");
  const match = content.match(/platform\s+:ios\s*,\s*['"](\d+\.\d+(?:\.\d+)?)['"]/);
  if (!match) {
    return [
      {
        policy_id: "ios-min-deployment-target",
        policy_name: "Minimum iOS Deployment Target",
        platform: "ios",
        severity: "error",
        auto_fixable: true,
        description: `iOS minimum deployment target must be >= ${MIN_IOS_VERSION}.`,
        docs_url: "https://reactnative.dev/docs/environment-setup",
        details: "Could not find platform :ios version in Podfile.",
        affected_files: ["ios/Podfile"],
      },
    ];
  }

  const current = match[1];
  if (!semver.lt(semver.coerce(current)!, semver.coerce(MIN_IOS_VERSION)!)) return [];

  return [
    {
      policy_id: "ios-min-deployment-target",
      policy_name: "Minimum iOS Deployment Target",
      platform: "ios",
      severity: "error",
      auto_fixable: true,
      description: `iOS minimum deployment target must be >= ${MIN_IOS_VERSION}.`,
      docs_url: "https://reactnative.dev/docs/environment-setup",
      details: `Podfile sets platform :ios, '${current}' — must be >= ${MIN_IOS_VERSION}.`,
      affected_files: ["ios/Podfile"],
    },
  ];
}

async function checkPbxproj(projectPath: string): Promise<Violation[]> {
  const iosDir = path.join(projectPath, "ios");
  if (!fs.existsSync(iosDir)) return [];

  const pbxprojPath = findPbxproj(iosDir);

  if (!pbxprojPath || !fs.existsSync(pbxprojPath)) return [];

  const content = fs.readFileSync(pbxprojPath, "utf-8");
  const matches = [...content.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+\.\d+)/g)];
  if (matches.length === 0) return [];

  const outdated = matches.filter(
    (m) => semver.lt(semver.coerce(m[1])!, semver.coerce(MIN_IOS_VERSION)!)
  );

  if (outdated.length === 0) return [];

  const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
  return [
    {
      policy_id: "ios-min-deployment-target",
      policy_name: "Minimum iOS Deployment Target",
      platform: "ios",
      severity: "error",
      auto_fixable: true,
      description: `IPHONEOS_DEPLOYMENT_TARGET in Xcode project must be >= ${MIN_IOS_VERSION}.`,
      docs_url: "https://reactnative.dev/docs/environment-setup",
      details: `${outdated.length} build configuration(s) set IPHONEOS_DEPLOYMENT_TARGET below ${MIN_IOS_VERSION}.`,
      affected_files: [relPath],
    },
  ];
}

function checkXcodeVersion(projectPath: string): Violation[] {
  for (const candidate of [".xcode-version", "ios/.xcode-version"]) {
    const file = path.join(projectPath, candidate);
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, "utf-8").trim();
    const versionMatch = content.match(/(\d+\.\d+(?:\.\d+)?)/);
    if (!versionMatch) continue;

    const current = versionMatch[1];
    if (semver.lt(semver.coerce(current)!, semver.coerce("16.0")!)) {
      return [
        {
          policy_id: "ios-xcode-version",
          policy_name: "Xcode Version Requirement",
          platform: "ios",
          severity: "warning",
          auto_fixable: false,
          description: "Apple requires Xcode 16+ for App Store submissions (since April 2025).",
          docs_url: "https://developer.apple.com/news/upcoming-requirements/",
          details: `${candidate} specifies Xcode ${current}. Upgrade to Xcode 16.0 or later.`,
          affected_files: [candidate],
        },
      ];
    }
  }
  return [];
}

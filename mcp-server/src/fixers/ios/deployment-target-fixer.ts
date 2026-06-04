import * as fs from "fs";
import * as path from "path";
import { FixResult } from "../../types";
import { backupAndWrite } from "../utils";

const TARGET_IOS = "15.1";

export async function fixDeploymentTarget(projectPath: string): Promise<FixResult> {
  const changes: FixResult["changes"] = [];

  fixPodfile(projectPath, changes);
  await fixPbxproj(projectPath, changes);

  return { violation_id: "ios-min-deployment-target", success: true, changes };
}

function fixPodfile(projectPath: string, changes: FixResult["changes"]): void {
  const file = path.join(projectPath, "ios", "Podfile");
  if (!fs.existsSync(file)) return;

  let content = fs.readFileSync(file, "utf-8");
  const regex = /platform\s+:ios\s*,\s*['"](\d+\.\d+(?:\.\d+)?)['"]/;
  const match = content.match(regex);

  if (!match) {
    content = `platform :ios, '${TARGET_IOS}'\n` + content;
  } else if (isOlderThan(match[1], TARGET_IOS)) {
    content = content.replace(regex, `platform :ios, '${TARGET_IOS}'`);
  } else {
    return;
  }

  const backup = backupAndWrite(file, content);
  changes.push({
    file: "ios/Podfile",
    description: `Updated platform :ios to '${TARGET_IOS}'`,
    backup_path: backup,
  });
}

async function fixPbxproj(projectPath: string, changes: FixResult["changes"]): Promise<void> {
  const iosDir = path.join(projectPath, "ios");
  if (!fs.existsSync(iosDir)) return;

  let pbxprojPath: string | null = null;
  try {
    for (const entry of fs.readdirSync(iosDir)) {
      if (entry.endsWith(".xcodeproj")) {
        const candidate = path.join(iosDir, entry, "project.pbxproj");
        if (fs.existsSync(candidate)) { pbxprojPath = candidate; break; }
      }
    }
  } catch {
    return;
  }

  if (!pbxprojPath || !fs.existsSync(pbxprojPath)) return;

  let content = fs.readFileSync(pbxprojPath, "utf-8");
  let modified = false;

  content = content.replace(
    /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+\.\d+)/g,
    (match, ver) => {
      if (isOlderThan(ver, TARGET_IOS)) {
        modified = true;
        return match.replace(ver, TARGET_IOS);
      }
      return match;
    }
  );

  if (modified) {
    const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
    const backup = backupAndWrite(pbxprojPath, content);
    changes.push({
      file: relPath,
      description: `Set IPHONEOS_DEPLOYMENT_TARGET to ${TARGET_IOS} in all build configurations`,
      backup_path: backup,
    });
  }
}

function isOlderThan(current: string, target: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [ca, cb] = parse(current);
  const [ta, tb] = parse(target);
  if (ca !== ta) return ca < ta;
  return cb < tb;
}

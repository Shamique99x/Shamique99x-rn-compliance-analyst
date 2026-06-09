/**
 * JSON-driven policy fix engine.
 *
 * Interprets the `fix` field of a Policy object and applies it to the project on
 * disk.  Counterpart to check-runner.ts — together they form the policy engine
 * that lets new policies added to the remote JSON take effect without any code
 * changes.
 *
 * Supported fix types
 * ───────────────────
 *   composite                 Run multiple sub-fixes
 *   properties_set            Set (or add) key=value in a .properties file
 *   gradle_cmake_arg_append   Inject a cmake argument into build.gradle
 *   cmake_linker_flag         Inject a linker flag into CMakeLists.txt
 *   gradle_int_property_set   Set integer property in gradle (checks variables.gradle)
 *   gradle_classpath_version_set  Set classpath dependency version in build.gradle
 *   create_file               Create a file from a named template if absent
 *   privacy_manifest_append_apis  Delegate to the existing privacy-manifest fixer
 *   podfile_platform_set      Set platform :ios version in Podfile
 *   pbxproj_property_set      Set a build-setting value in every build config
 */

import * as fs   from "fs";
import * as path from "path";
import { PolicyFix, FixResult } from "../types";
import { backupAndWrite }       from "../fixers/utils";
import { fixPrivacyManifest }   from "../fixers/ios/privacy-manifest-fixer";
import { findPbxproj }          from "./check-runner";

// ── Privacy manifest template ─────────────────────────────────────────────────

const PRIVACY_MANIFEST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<false/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array/>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array/>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array/>
</dict>
</plist>
`;

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runFix(
  projectPath: string,
  violationId: string,
  fix: PolicyFix
): Promise<FixResult> {
  try {
    const changes = await applyFix(projectPath, fix);
    return { violation_id: violationId, success: true, changes };
  } catch (err) {
    return {
      violation_id: violationId,
      success: false,
      changes: [],
      error: (err as Error).message,
    };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

async function applyFix(
  projectPath: string,
  fix: PolicyFix
): Promise<FixResult["changes"]> {
  switch (fix.type) {
    case "composite":
      return applyComposite(projectPath, fix);
    case "properties_set":
      return applyPropertiesSet(projectPath, fix);
    case "gradle_cmake_arg_append":
      return applyGradleCmakeArgAppend(projectPath, fix);
    case "cmake_linker_flag":
      return applyCmakeLinkerFlag(projectPath, fix);
    case "gradle_int_property_set":
      return applyGradleIntPropertySet(projectPath, fix);
    case "gradle_classpath_version_set":
      return applyGradleClasspathVersionSet(projectPath, fix);
    case "create_file":
      return applyCreateFile(projectPath, fix);
    case "privacy_manifest_append_apis": {
      // Delegate entirely to the existing fixer (which also creates the file if missing)
      const result = await fixPrivacyManifest(projectPath);
      return result.changes;
    }
    case "podfile_platform_set":
      return applyPodfilePlatformSet(projectPath, fix);
    case "pbxproj_property_set":
      return applyPbxprojPropertySet(projectPath, fix);
    default:
      // Unknown type: no-op (don't throw — skip gracefully)
      return [];
  }
}

// ── composite ─────────────────────────────────────────────────────────────────

async function applyComposite(
  projectPath: string,
  fix: PolicyFix
): Promise<FixResult["changes"]> {
  const subFixes = fix["changes"] as PolicyFix[];
  if (!Array.isArray(subFixes)) return [];

  const allChanges: FixResult["changes"] = [];
  for (const subFix of subFixes) {
    const changes = await applyFix(projectPath, subFix);
    allChanges.push(...changes);
  }
  return allChanges;
}

// ── properties_set ────────────────────────────────────────────────────────────
// Sets (or appends) a key=value line in a .properties file.
// Handles full-line replacements like `distributionUrl=…`.

function applyPropertiesSet(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file  = fix["file"]  as string;
  const key   = fix["key"]   as string;
  const value = fix["value"] as string;

  const fullPath = path.join(projectPath, file);
  let content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";

  const lineRegex = new RegExp(`^(\\s*${escapeRegex(key)}\\s*=).*$`, "m");
  let modified = false;

  if (lineRegex.test(content)) {
    const newContent = content.replace(lineRegex, `$1${value}`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    } else {
      return []; // already correct
    }
  } else {
    // Append new key
    content = content.trimEnd() + `\n${key}=${value}\n`;
    modified = true;
  }

  if (!modified) return [];
  const backup = backupAndWrite(fullPath, content);
  return [{ file, description: `Set ${key}=${value}`, backup_path: backup }];
}

// ── gradle_cmake_arg_append ───────────────────────────────────────────────────

function applyGradleCmakeArgAppend(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file = fix["file"] as string;
  const arg  = fix["arg"]  as string;

  const fullPath = path.join(projectPath, file);
  if (!fs.existsSync(fullPath)) return [];

  let content = fs.readFileSync(fullPath, "utf-8");
  if (content.includes(arg)) return []; // already present

  content = injectCmakeArg(content, arg);
  const backup = backupAndWrite(fullPath, content);
  return [{ file, description: `Added cmake argument ${arg}`, backup_path: backup }];
}

// ── cmake_linker_flag ─────────────────────────────────────────────────────────

function applyCmakeLinkerFlag(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file     = fix["file"]     as string;
  const flag     = fix["flag"]     as string;
  const optional = fix["optional"] as boolean | undefined;

  const fullPath = path.join(projectPath, file);
  if (!fs.existsSync(fullPath)) {
    if (optional) return []; // Capacitor / no-NDK projects
    return [];
  }

  let content = fs.readFileSync(fullPath, "utf-8");
  if (content.includes(flag)) return []; // already present

  content = injectCmakeLinkerFlag(content, flag);
  const backup = backupAndWrite(fullPath, content);
  return [{ file, description: `Added linker flag ${flag}`, backup_path: backup }];
}

// ── gradle_int_property_set ───────────────────────────────────────────────────
// Writes to whichever gradle file already defines the property.
// Checks variables.gradle first (Capacitor pattern), then the declared file.

function applyGradleIntPropertySet(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file     = fix["file"]     as string;
  const property = fix["property"] as string;
  const value    = fix["value"]    as number;

  const candidates = unique([
    "android/variables.gradle",
    file,
    "android/app/build.gradle",
  ]);

  for (const candidate of candidates) {
    const fullPath = path.join(projectPath, candidate);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    const regex   = new RegExp(`(${escapeRegex(property)}\\s*(?:[=:\\s])\\s*)\\d+`);
    if (!regex.test(content)) continue; // property not in this file

    const newContent = content.replace(regex, `$1${value}`);
    if (newContent === content) return []; // already the right value
    const backup = backupAndWrite(fullPath, newContent);
    return [{
      file: candidate,
      description: `Set ${property} to ${value}`,
      backup_path: backup,
    }];
  }

  // Property not found in any candidate — append to the declared file
  const targetPath = path.join(projectPath, file);
  const content = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf-8") : "";
  // Can't safely inject into Groovy DSL without context — skip
  return [{
    file,
    description: `WARNING: ${property} not found in any gradle file — manual update required`,
    backup_path: "",
  }];
}

// ── gradle_classpath_version_set ──────────────────────────────────────────────

function applyGradleClasspathVersionSet(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file       = fix["file"]       as string;
  const dependency = fix["dependency"] as string;
  const version    = fix["version"]    as string;

  const fullPath = path.join(projectPath, file);
  if (!fs.existsSync(fullPath)) return [];

  const content  = fs.readFileSync(fullPath, "utf-8");
  const regex    = new RegExp(`(${escapeRegex(dependency)}:)(\\d+\\.\\d+\\.\\d+)`);
  if (!regex.test(content)) return []; // dependency not present — nothing to do

  const newContent = content.replace(regex, `$1${version}`);
  if (newContent === content) return []; // already correct

  const backup = backupAndWrite(fullPath, newContent);
  return [{
    file,
    description: `Updated ${dependency} to ${version}`,
    backup_path: backup,
  }];
}

// ── create_file ───────────────────────────────────────────────────────────────

function applyCreateFile(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file     = fix["file"]     as string;
  const template = fix["template"] as string;

  const fullPath = path.join(projectPath, file);
  if (fs.existsSync(fullPath)) return []; // already exists

  const content = resolveTemplate(template);
  const backup  = backupAndWrite(fullPath, content);
  return [{ file, description: `Created ${file} from template '${template}'`, backup_path: backup }];
}

function resolveTemplate(name: string): string {
  switch (name) {
    case "privacy_manifest_template":
      return PRIVACY_MANIFEST_TEMPLATE;
    default:
      return `<!-- Template '${name}' not found — please fill in manually -->\n`;
  }
}

// ── podfile_platform_set ──────────────────────────────────────────────────────

function applyPodfilePlatformSet(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const file    = fix["file"]    as string;
  const version = fix["version"] as string;

  const fullPath = path.join(projectPath, file);
  if (!fs.existsSync(fullPath)) return [];

  let content = fs.readFileSync(fullPath, "utf-8");
  const regex = /platform\s+:ios\s*,\s*['"][^'"]*['"]/;

  if (regex.test(content)) {
    content = content.replace(regex, `platform :ios, '${version}'`);
  } else {
    // Prepend platform line
    content = `platform :ios, '${version}'\n` + content;
  }

  const backup = backupAndWrite(fullPath, content);
  return [{ file, description: `Set platform :ios, '${version}'`, backup_path: backup }];
}

// ── pbxproj_property_set ──────────────────────────────────────────────────────

function applyPbxprojPropertySet(
  projectPath: string,
  fix: PolicyFix
): FixResult["changes"] {
  const property = fix["property"] as string;
  const value    = fix["value"]    as string;

  const pbxprojPath = findPbxproj(path.join(projectPath, "ios"));
  if (!pbxprojPath) return [];

  const content    = fs.readFileSync(pbxprojPath, "utf-8");
  const regex      = new RegExp(`(${escapeRegex(property)}\\s*=\\s*)[\\d.]+`, "g");
  const newContent = content.replace(regex, `$1${value}`);

  if (newContent === content) return []; // nothing changed

  const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
  const backup  = backupAndWrite(pbxprojPath, newContent);
  return [{
    file: relPath,
    description: `Set ${property} = ${value} in all build configurations`,
    backup_path: backup,
  }];
}

// ── cmake helpers (ported from page-size-fixer.ts) ────────────────────────────

function injectCmakeArg(content: string, arg: string): string {
  const argsRegex =
    /(cmake\s*\{[^}]*?arguments\s+(?:"[^"]*"(?:\s*,\s*"[^"]*")*\s*,\s*)?)("[^"]*")/s;
  if (argsRegex.test(content)) {
    return content.replace(argsRegex, `$1$2, "${arg}"`);
  }

  const cmakeBlockRegex = /(cmake\s*\{)/;
  if (cmakeBlockRegex.test(content)) {
    return content.replace(cmakeBlockRegex, `$1\n                arguments "${arg}"`);
  }

  const defaultConfigRegex = /(defaultConfig\s*\{)/;
  if (defaultConfigRegex.test(content)) {
    return content.replace(
      defaultConfigRegex,
      `$1\n        externalNativeBuild {\n            cmake {\n                arguments "${arg}"\n            }\n        }`
    );
  }

  return content;
}

function injectCmakeLinkerFlag(content: string, flag: string): string {
  const tloRegex = /(target_link_options\([^)]+)(PRIVATE)([^)]*)\)/;
  if (tloRegex.test(content)) {
    return content.replace(tloRegex, `$1$2$3 "${flag}")`);
  }

  const targetMatch = content.match(/add_library\((\w+)/);
  const targetName  = targetMatch ? targetMatch[1] : "${PROJECT_NAME}";
  return content.trimEnd() + `\ntarget_link_options(${targetName} PRIVATE "${flag}")\n`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

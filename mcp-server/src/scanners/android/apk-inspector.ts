/**
 * APK-level 16 KB page-size compliance inspector.
 *
 * Build-config checks (gradle.properties, CMakeLists.txt) can only verify
 * your own code.  A third-party native library compiled without the right
 * alignment flags will still cause crashes on 16 KB devices even when all
 * the Gradle flags are correct.
 *
 * This inspector:
 *   1. Locates a built APK in the project's standard output directories.
 *   2. Opens it as a ZIP and iterates every lib/<abi>/<name>.so entry.
 *   3. For each .so it checks:
 *        a. Compression — must be STORED (method 0), not DEFLATED.
 *           Compressed .so files cannot be memory-mapped by the OS.
 *        b. PT_LOAD alignment — minimum alignment across all PT_LOAD
 *           ELF segments must be >= 16 384 bytes (0x4000).
 *   4. Returns a structured result listing every non-compliant library.
 */

import * as fs   from "fs";
import * as path from "path";
import AdmZip    from "adm-zip";
import { parseElf, PAGE_16KB } from "./elf-parser";

// 32-bit ABIs use 4 KB pages by CPU architecture — the 16 KB requirement
// only applies to 64-bit ABIs.  Never flag these as non-compliant.
const THIRTY_TWO_BIT_ABIS = new Set(["armeabi-v7a", "armeabi", "x86", "mips"]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface NativeLibraryResult {
  /** e.g. "libhermes.so" */
  name: string;
  /** e.g. "arm64-v8a" */
  abi: string;
  /** true if stored with Deflate compression (bad) */
  compressed: boolean;
  /** minimum PT_LOAD p_align value, or null if ELF parse failed */
  load_alignment: number | null;
  compliant: boolean;
  /** human-readable reasons this library fails, empty when compliant */
  issues: string[];
}

export interface ApkInspectionResult {
  apk_path: string;
  libraries_checked: number;
  non_compliant: NativeLibraryResult[];
  compliant: boolean;
  /** set when the APK could not be opened or read */
  error?: string;
}

// ── APK discovery ─────────────────────────────────────────────────────────────

const APK_CANDIDATES = [
  "android/app/build/outputs/apk/debug/app-debug.apk",
  "android/app/build/outputs/apk/release/app-release.apk",
  "android/app/build/outputs/apk/release/app-release-unsigned.apk",
  // bundle tool universal APK output
  "android/app/build/outputs/apk/debugAndroidTest/app-debug-androidTest.apk",
];

export function findApk(projectPath: string): string | null {
  for (const rel of APK_CANDIDATES) {
    const full = path.join(projectPath, rel);
    if (fs.existsSync(full)) return full;
  }

  // Also do a shallow glob under build/outputs/apk/ for non-standard names
  const outputDir = path.join(projectPath, "android/app/build/outputs/apk");
  if (!fs.existsSync(outputDir)) return null;

  for (const variant of fs.readdirSync(outputDir)) {
    const variantDir = path.join(outputDir, variant);
    if (!fs.statSync(variantDir).isDirectory()) continue;
    for (const file of fs.readdirSync(variantDir)) {
      if (file.endsWith(".apk")) return path.join(variantDir, file);
    }
  }

  return null;
}

// ── Core inspector ────────────────────────────────────────────────────────────

export function inspectApk(apkPath: string): ApkInspectionResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(apkPath);
  } catch (err) {
    return {
      apk_path: apkPath,
      libraries_checked: 0,
      non_compliant: [],
      compliant: false,
      error: `Could not open APK: ${(err as Error).message}`,
    };
  }

  const results: NativeLibraryResult[] = [];

  for (const entry of zip.getEntries()) {
    // Only care about native libraries: lib/<abi>/<name>.so
    const match = entry.entryName.match(/^lib\/([^/]+)\/(.+\.so(?:\.[^/]+)?)$/);
    if (!match) continue;

    const [, abi, name] = match;
    const issues: string[] = [];

    // ── Check 1: compression ────────────────────────────────────────────────
    // ZIP method 0 = STORED, method 8 = DEFLATED.
    // adm-zip exposes this via entry.header.method.
    const method = (entry.header as unknown as { method: number }).method;
    const compressed = method !== 0;
    if (compressed) {
      issues.push(
        `Stored with compression (method=${method}) — must be STORED (method=0) ` +
        `so the OS can memory-map it directly`
      );
    }

    // ── Check 2: ELF PT_LOAD alignment ──────────────────────────────────────
    let load_alignment: number | null = null;
    try {
      const data  = entry.getData();
      const info  = parseElf(data);
      if (info) {
        load_alignment = info.minLoadAlignment;
        // 16 KB page-size requirement only applies to 64-bit ABIs.
        // 32-bit ABIs (armeabi-v7a, x86, etc.) intentionally use 4 KB pages.
        if (!THIRTY_TWO_BIT_ABIS.has(abi) && load_alignment < PAGE_16KB) {
          issues.push(
            `PT_LOAD alignment is ${load_alignment} bytes ` +
            `(0x${load_alignment.toString(16).toUpperCase()}) — ` +
            `must be ≥ 16 384 bytes (0x4000) for 16 KB page-size devices`
          );
        }
      } else {
        issues.push("Could not parse ELF program headers");
      }
    } catch (err) {
      issues.push(`ELF read error: ${(err as Error).message}`);
    }

    results.push({
      name,
      abi,
      compressed,
      load_alignment,
      compliant: issues.length === 0,
      issues,
    });
  }

  const nonCompliant = results.filter((r) => !r.compliant);

  return {
    apk_path: apkPath,
    libraries_checked: results.length,
    non_compliant: nonCompliant,
    compliant: nonCompliant.length === 0,
  };
}

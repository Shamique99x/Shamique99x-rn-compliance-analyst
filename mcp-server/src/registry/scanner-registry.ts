/**
 * Scanner Registry
 *
 * Maps policy IDs to TypeScript scanner implementations.
 * The engine in check-runner.ts handles all generic check types
 * (file_exists, gradle_int_property, etc.). This registry covers
 * only the custom scanners that require code-level logic.
 *
 * Note: Capacitor is not supported in the Claude Code plugin.
 * See BUS-Apps-Compliance for the full React Native + Capacitor version.
 */

import { Violation } from "../types";
import { scanPageSize }         from "../scanners/android/page-size";
import { scanSdkVersions }      from "../scanners/android/sdk-versions";
import { scanPrivacyManifest }  from "../scanners/ios/privacy-manifest";
import { scanDeploymentTarget } from "../scanners/ios/deployment-target";

export type SyncScanner  = (projectPath: string) => Violation[];
export type AsyncScanner = (projectPath: string) => Promise<Violation[]>;
export type AnyScanner   = SyncScanner | AsyncScanner;

/** Custom scanners keyed by their logical name. */
export const SCANNER_REGISTRY: Record<string, AnyScanner> = {
  /** Android: checks RN version and NDK/CMake alignment for 16 KB page-size support. */
  "android-page-size":    scanPageSize,
  /** Android: checks targetSdkVersion, compileSdkVersion, AGP, and Gradle wrapper. */
  "android-sdk-versions": scanSdkVersions,
  /** iOS: checks PrivacyInfo.xcprivacy existence and required reason API entries. */
  "ios-privacy-manifest": scanPrivacyManifest,
  /** iOS: checks Podfile platform version and Xcode deployment target. */
  "ios-deployment-target": scanDeploymentTarget,
};

/** Resolve a scanner by name. Returns undefined if not registered. */
export function getScanner(name: string): AnyScanner | undefined {
  return SCANNER_REGISTRY[name];
}

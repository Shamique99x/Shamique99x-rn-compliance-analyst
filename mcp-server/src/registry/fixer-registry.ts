/**
 * Fixer Registry
 *
 * Maps JSON policy fix types and policy IDs to TypeScript fixer
 * implementations. The engine in fix-runner.ts handles all generic fix
 * types (properties_set, gradle_cmake_arg_append, etc.). This registry
 * documents the custom fixers that require code-level logic.
 */

import { FixResult } from "../types";
import { fixPrivacyManifest }        from "../fixers/ios/privacy-manifest-fixer";
import { fixDeploymentTarget }       from "../fixers/ios/deployment-target-fixer";
import { fixPageSize }               from "../fixers/android/page-size-fixer";
import { fixSdkVersions }            from "../fixers/android/sdk-version-fixer";

export type SyncFixer       = (projectPath: string) => FixResult;
export type SyncMultiFixer  = (projectPath: string) => FixResult[];
export type AsyncFixer      = (projectPath: string) => Promise<FixResult>;
export type AnyFixer        = SyncFixer | SyncMultiFixer | AsyncFixer;

/**
 * Custom fixers keyed by their logical name.
 * Check the individual fixer's return type before calling.
 */
export const FIXER_REGISTRY: Record<string, AnyFixer> = {
  /** iOS: creates PrivacyInfo.xcprivacy and appends required-reason API entries. Async. */
  "ios-privacy-manifest":    fixPrivacyManifest,
  /** iOS: updates Podfile platform version and Xcode deployment target. Async. */
  "ios-deployment-target":   fixDeploymentTarget,
  /** Android: updates NDK/CMake flags for 16 KB page-size alignment. Sync. */
  "android-page-size":       fixPageSize,
  /** Android: bumps targetSdkVersion / compileSdkVersion to compliant values. Sync, returns array. */
  "android-sdk-versions":    fixSdkVersions,
};

/** Resolve a fixer by name. Returns undefined if not registered. */
export function getFixer(name: string): AnyFixer | undefined {
  return FIXER_REGISTRY[name];
}


"use strict";
/**
 * Fixer Registry
 *
 * Maps JSON policy fix types and policy IDs to TypeScript fixer
 * implementations. The engine in fix-runner.ts handles all generic fix
 * types (properties_set, gradle_cmake_arg_append, etc.). This registry
 * documents the custom fixers that require code-level logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIXER_REGISTRY = void 0;
exports.getFixer = getFixer;
const privacy_manifest_fixer_1 = require("../fixers/ios/privacy-manifest-fixer");
const deployment_target_fixer_1 = require("../fixers/ios/deployment-target-fixer");
const page_size_fixer_1 = require("../fixers/android/page-size-fixer");
const sdk_version_fixer_1 = require("../fixers/android/sdk-version-fixer");
/**
 * Custom fixers keyed by their logical name.
 * Check the individual fixer's return type before calling.
 */
exports.FIXER_REGISTRY = {
    /** iOS: creates PrivacyInfo.xcprivacy and appends required-reason API entries. Async. */
    "ios-privacy-manifest": privacy_manifest_fixer_1.fixPrivacyManifest,
    /** iOS: updates Podfile platform version and Xcode deployment target. Async. */
    "ios-deployment-target": deployment_target_fixer_1.fixDeploymentTarget,
    /** Android: updates NDK/CMake flags for 16 KB page-size alignment. Sync. */
    "android-page-size": page_size_fixer_1.fixPageSize,
    /** Android: bumps targetSdkVersion / compileSdkVersion to compliant values. Sync, returns array. */
    "android-sdk-versions": sdk_version_fixer_1.fixSdkVersions,
};
/** Resolve a fixer by name. Returns undefined if not registered. */
function getFixer(name) {
    return exports.FIXER_REGISTRY[name];
}
//# sourceMappingURL=fixer-registry.js.map
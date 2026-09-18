"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCANNER_REGISTRY = void 0;
exports.getScanner = getScanner;
const page_size_1 = require("../scanners/android/page-size");
const sdk_versions_1 = require("../scanners/android/sdk-versions");
const privacy_manifest_1 = require("../scanners/ios/privacy-manifest");
const deployment_target_1 = require("../scanners/ios/deployment-target");
/** Custom scanners keyed by their logical name. */
exports.SCANNER_REGISTRY = {
    /** Android: checks RN version and NDK/CMake alignment for 16 KB page-size support. */
    "android-page-size": page_size_1.scanPageSize,
    /** Android: checks targetSdkVersion, compileSdkVersion, AGP, and Gradle wrapper. */
    "android-sdk-versions": sdk_versions_1.scanSdkVersions,
    /** iOS: checks PrivacyInfo.xcprivacy existence and required reason API entries. */
    "ios-privacy-manifest": privacy_manifest_1.scanPrivacyManifest,
    /** iOS: checks Podfile platform version and Xcode deployment target. */
    "ios-deployment-target": deployment_target_1.scanDeploymentTarget,
};
/** Resolve a scanner by name. Returns undefined if not registered. */
function getScanner(name) {
    return exports.SCANNER_REGISTRY[name];
}
//# sourceMappingURL=scanner-registry.js.map
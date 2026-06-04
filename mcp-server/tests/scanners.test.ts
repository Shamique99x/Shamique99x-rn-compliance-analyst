import * as path from "path";
import { scanPageSize } from "../src/scanners/android/page-size";
import { scanSdkVersions } from "../src/scanners/android/sdk-versions";
import { scanPrivacyManifest } from "../src/scanners/ios/privacy-manifest";
import { scanDeploymentTarget } from "../src/scanners/ios/deployment-target";

const PROJECT_FIXTURE = path.join(__dirname, "fixtures", "project");

describe("Android — page size scanner", () => {
  it("detects old RN version even without project native code", () => {
    const violations = scanPageSize(PROJECT_FIXTURE);
    expect(violations).toHaveLength(1);
    expect(violations[0].policy_id).toBe("android-16kb-page-size");
    expect(violations[0].details).toContain("0.71.13");
    expect(violations[0].details).toContain("0.74.0");
  });
});

describe("Android — SDK version scanner", () => {
  it("resolves targetSdkVersion from root build.gradle ext block", () => {
    const violations = scanSdkVersions(PROJECT_FIXTURE);
    const sdkViolation = violations.find((v) => v.policy_id === "android-target-sdk");
    expect(sdkViolation).toBeDefined();
    expect(sdkViolation?.details).toContain("targetSdkVersion is 33");
  });

  it("detects AGP below 8.3.0", () => {
    const violations = scanSdkVersions(PROJECT_FIXTURE);
    const agpViolation = violations.find((v) => v.policy_id === "android-agp-version");
    expect(agpViolation).toBeDefined();
    expect(agpViolation?.details).toContain("8.1.4");
  });

  it("does not flag Gradle wrapper 8.3 as below 8.6", () => {
    const violations = scanSdkVersions(PROJECT_FIXTURE);
    const wrapperViolation = violations.find((v) => v.policy_id === "android-gradle-wrapper");
    expect(wrapperViolation).toBeDefined();
  });
});

describe("iOS — privacy manifest scanner", () => {
  it("detects missing PrivacyInfo.xcprivacy", async () => {
    const violations = await scanPrivacyManifest(PROJECT_FIXTURE);
    const manifestViolation = violations.find((v) => v.policy_id === "ios-privacy-manifest-exists");
    expect(manifestViolation).toBeDefined();
  });

  it("detects AsyncStorage usage requiring NSPrivacyAccessedAPICategoryUserDefaults", async () => {
    const violations = await scanPrivacyManifest(PROJECT_FIXTURE);
    const apiViolation = violations.find((v) => v.policy_id === "ios-privacy-required-reason-apis");
    expect(apiViolation).toBeDefined();
    expect(apiViolation?.details).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
  });
});

describe("iOS — deployment target scanner", () => {
  it("detects Podfile platform below 15.1", async () => {
    const violations = await scanDeploymentTarget(PROJECT_FIXTURE);
    const violation = violations.find((v) => v.policy_id === "ios-min-deployment-target");
    expect(violation).toBeDefined();
    expect(violation?.details).toContain("13.0");
  });
});

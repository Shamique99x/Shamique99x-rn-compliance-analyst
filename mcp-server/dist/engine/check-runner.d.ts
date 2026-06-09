/**
 * JSON-driven policy check engine.
 *
 * Interprets the `check` field of a Policy object and evaluates it against the
 * project on disk.  No hardcoded scanner logic — everything comes from the JSON,
 * so new policies pushed to the remote cache work immediately after
 * `compliance_refresh_policies` without any code changes.
 *
 * Supported check types
 * ─────────────────────
 *   composite               Run multiple sub-checks; fail if any fail
 *   file_exists             Required file must be present
 *   file_contains           .properties-style key=value must be set correctly
 *   gradle_int_property     Integer property must meet minimum value
 *   gradle_cmake_arg        Specific cmake argument must be present in build.gradle
 *   gradle_classpath_version  Classpath dependency must meet minimum version
 *   properties_version      Version extracted via regex must meet minimum
 *   podfile_platform_version  iOS Podfile platform version must meet minimum
 *   pbxproj_property        Xcode project property must meet minimum version
 *   xcode_version_file      .xcode-version file must meet minimum version
 *   package_json_min_version  npm package in package.json must meet minimum version
 *   privacy_required_reason_apis  (complex — deferred to custom scanner in scan.ts)
 */
import { PolicyCheck } from "../types";
export interface CheckResult {
    passed: boolean;
    /** Human-readable explanation when passed=false */
    details: string;
    /** Relative file paths that contain the problem */
    affected_files: string[];
}
export declare function runCheck(projectPath: string, check: PolicyCheck): CheckResult;
export declare function findPbxproj(iosDir: string): string | null;
//# sourceMappingURL=check-runner.d.ts.map
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
import { PolicyFix, FixResult } from "../types";
export declare function runFix(projectPath: string, violationId: string, fix: PolicyFix): Promise<FixResult>;
//# sourceMappingURL=fix-runner.d.ts.map
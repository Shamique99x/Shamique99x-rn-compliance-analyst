/**
 * compliance_inspect_apk
 *
 * Runs the APK-level 16 KB page-size inspection on a specific APK file
 * (or auto-discovers one) and returns the full native library report
 * plus package upgrade suggestions.
 */
import { ApkInspectionResult } from "../scanners/android/apk-inspector";
import { ApkLibUpgrade } from "../scanners/android/lib-mapper";
export interface InspectApkResult {
    inspection: ApkInspectionResult;
    upgrades: ApkLibUpgrade[];
}
/**
 * @param projectPath  Root of the RN project (used for APK discovery + package.json lookup)
 * @param apkPath      Explicit path to an APK file. If omitted, auto-discovers.
 * @param variant      "debug" | "release" — hint for auto-discovery when apkPath is omitted
 */
export declare function inspectApkTool(projectPath: string, apkPath?: string, variant?: string): Promise<InspectApkResult>;
//# sourceMappingURL=inspect-apk.d.ts.map
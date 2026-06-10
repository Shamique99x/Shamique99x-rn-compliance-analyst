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
    /** True when the APK is older than one or more build config files.
     *  ELF results are still shown but cannot be trusted until rebuilt. */
    stale?: boolean;
    /** Which build file is newer than the APK */
    stale_reason?: string;
    /** set when the APK could not be opened or read */
    error?: string;
}
export declare function findApk(projectPath: string): string | null;
export declare function inspectApk(apkPath: string): ApkInspectionResult;
export declare function checkApkStaleness(apkPath: string, projectPath: string): {
    stale: boolean;
    reason?: string;
};
//# sourceMappingURL=apk-inspector.d.ts.map
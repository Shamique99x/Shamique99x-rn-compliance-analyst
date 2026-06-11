/**
 * Maps non-compliant native .so filenames found in an APK back to the npm
 * package that ships them, then cross-references the project's package.json
 * to produce specific upgrade suggestions.
 *
 * Two-tier lookup
 * ───────────────
 * 1. Static map  — policies/native-lib-map.json covers the most popular ~14
 *    React Native libraries with confirmed/community-reported minimum versions.
 *    Fast, offline, zero API cost.
 *
 * 2. Claude fallback — any .so not matched by the static map is sent to
 *    claude-haiku in a single batch call.  Results are marked
 *    confidence="ai-identified" so developers know to verify.
 *    Requires ANTHROPIC_API_KEY.  Skipped gracefully if the key is absent.
 */
import { LibUpgrade } from "../../types";
export interface ApkLibUpgrade extends LibUpgrade {
    /** The .so filename that triggered this suggestion */
    triggered_by_so: string;
    /** ABI the non-compliant .so was found in, e.g. "arm64-v8a" */
    triggered_by_abi: string;
    confidence: "confirmed" | "community-reported" | "estimated" | "ai-identified" | "unknown";
}
interface NonCompliantLib {
    name: string;
    abi: string;
}
/**
 * Resolve upgrade suggestions for every non-compliant library.
 *
 * Static map is checked first (fast, offline).
 * Anything unrecognised is sent to Claude in one batch call.
 * Already-compliant-version packages are silently skipped.
 */
export declare function resolveUpgrades(nonCompliantLibs: NonCompliantLib[], projectPath: string): Promise<ApkLibUpgrade[]>;
export {};
//# sourceMappingURL=lib-mapper.d.ts.map
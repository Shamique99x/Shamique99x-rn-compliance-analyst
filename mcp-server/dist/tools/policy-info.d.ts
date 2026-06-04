/**
 * compliance_policy_info
 *
 * Returns metadata about every policy database currently loaded:
 * versions, policy counts, cache age, and source (remote cache vs bundled).
 */
export interface PlatformPolicyInfo {
    version: string;
    policy_count: number;
    /** ISO timestamp of when the remote cache was last written, or null if never fetched */
    fetched_at: string | null;
    /** Age of the cache in hours, or null if never fetched */
    cache_age_hours: number | null;
    /** true if cache is older than 24 h or doesn't exist */
    stale: boolean;
    /** "cache" if a valid remote cache is in use, "bundled" otherwise */
    source: "cache" | "bundled";
    policies: Array<{
        id: string;
        name: string;
        severity: string;
        auto_fixable: boolean;
    }>;
}
export interface NativeLibMapInfo {
    version: string;
    mapping_count: number;
}
export interface PolicyInfoResult {
    android: PlatformPolicyInfo;
    ios: PlatformPolicyInfo;
    native_lib_map: NativeLibMapInfo;
}
export declare function getPolicyInfo(): PolicyInfoResult;
//# sourceMappingURL=policy-info.d.ts.map
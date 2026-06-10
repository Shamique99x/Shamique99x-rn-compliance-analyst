export interface CacheStatusResult {
    android: {
        stale: boolean;
    };
    ios: {
        stale: boolean;
    };
}
export declare function getCacheStatus(): CacheStatusResult;
//# sourceMappingURL=cache-status.d.ts.map
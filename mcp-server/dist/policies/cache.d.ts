import { PolicyDatabase, Platform } from "../types";
export declare function readCache(platform: Platform): PolicyDatabase | null;
export declare function writeCache(platform: Platform, data: PolicyDatabase): void;
export declare function isCacheStale(platform: Platform): boolean;
//# sourceMappingURL=cache.d.ts.map
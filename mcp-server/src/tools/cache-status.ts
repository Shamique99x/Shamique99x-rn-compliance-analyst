import { isCacheStale } from "../services/policy/cache";

export interface CacheStatusResult {
  android: { stale: boolean };
  ios:     { stale: boolean };
}

export function getCacheStatus(): CacheStatusResult {
  return {
    android: { stale: isCacheStale("android") },
    ios:     { stale: isCacheStale("ios") },
  };
}

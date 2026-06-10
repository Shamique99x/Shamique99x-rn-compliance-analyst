"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheStatus = getCacheStatus;
const cache_1 = require("../services/policy/cache");
function getCacheStatus() {
    return {
        android: { stale: (0, cache_1.isCacheStale)("android") },
        ios: { stale: (0, cache_1.isCacheStale)("ios") },
    };
}
//# sourceMappingURL=cache-status.js.map
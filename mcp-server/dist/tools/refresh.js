"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceRefreshPolicies = complianceRefreshPolicies;
const fetcher_1 = require("../services/policy/fetcher");
async function complianceRefreshPolicies(remoteUrl, platforms = ["android", "ios"]) {
    return (0, fetcher_1.refreshPolicies)(platforms, remoteUrl);
}
//# sourceMappingURL=refresh.js.map
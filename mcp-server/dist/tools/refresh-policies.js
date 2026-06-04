"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceRefreshPolicies = complianceRefreshPolicies;
const fetcher_1 = require("../policies/fetcher");
async function complianceRefreshPolicies(remoteUrl, platforms = ["android", "ios"]) {
    return (0, fetcher_1.refreshPolicies)(platforms, remoteUrl);
}
//# sourceMappingURL=refresh-policies.js.map
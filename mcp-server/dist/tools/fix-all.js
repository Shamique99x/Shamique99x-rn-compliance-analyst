"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceFixAll = complianceFixAll;
const scan_1 = require("./scan");
const fix_1 = require("./fix");
async function complianceFixAll(projectPath) {
    const scan = await (0, scan_1.complianceScan)(projectPath);
    const fixableIds = scan.violations
        .filter((v) => v.auto_fixable)
        .map((v) => v.policy_id);
    return (0, fix_1.complianceFix)(projectPath, fixableIds);
}
//# sourceMappingURL=fix-all.js.map
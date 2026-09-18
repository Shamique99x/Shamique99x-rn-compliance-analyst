import { FixAllResult } from "../types";
import { complianceScan } from "./scan";
import { complianceFix }  from "./fix";

export async function complianceFixAll(projectPath: string): Promise<FixAllResult> {
  const scan       = await complianceScan(projectPath);
  const fixableIds = scan.violations
    .filter((v) => v.auto_fixable)
    .map((v) => v.policy_id);

  return complianceFix(projectPath, fixableIds);
}

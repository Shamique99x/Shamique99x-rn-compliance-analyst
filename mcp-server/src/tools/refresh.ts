import { Platform, PolicyRefreshResult } from "../types";
import { refreshPolicies } from "../services/policy/fetcher";

export async function complianceRefreshPolicies(
  remoteUrl?: string,
  platforms: Platform[] = ["android", "ios"]
): Promise<PolicyRefreshResult> {
  return refreshPolicies(platforms, remoteUrl);
}

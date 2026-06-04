import { Platform, PolicyRefreshResult } from "../types";
import { refreshPolicies } from "../policies/fetcher";

export async function complianceRefreshPolicies(
  remoteUrl?: string,
  platforms: Platform[] = ["android", "ios"]
): Promise<PolicyRefreshResult> {
  return refreshPolicies(platforms, remoteUrl);
}

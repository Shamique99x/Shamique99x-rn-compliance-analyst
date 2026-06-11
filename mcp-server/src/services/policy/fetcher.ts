import * as https from "https";
import { PolicyDatabase, Platform, PolicyRefreshResult } from "../../types";
import { writeCache, readCache } from "./cache";

const DEFAULT_BASE_URL =
  process.env.POLICIES_REMOTE_URL ??
  "https://raw.githubusercontent.com/Shamique99x/rn-compliance-analyst/main/mcp-server/policies";

export async function refreshPolicies(
  platforms: Platform[],
  remoteUrl?: string
): Promise<PolicyRefreshResult> {
  const base = remoteUrl ?? DEFAULT_BASE_URL;
  const changelog: string[] = [];
  let anyUpdated = false;
  let latestVersion = "unknown";

  for (const platform of platforms) {
    const url = `${base}/${platform}.json`;
    try {
      const fresh = await fetchJson<PolicyDatabase>(url);
      const existing = readCache(platform);
      if (!existing || fresh.version !== existing.version) {
        writeCache(platform, fresh);
        changelog.push(`${platform}: ${existing?.version ?? "none"} → ${fresh.version}`);
        anyUpdated = true;
      }
      latestVersion = fresh.version;
    } catch (err) {
      changelog.push(`${platform}: fetch failed — ${(err as Error).message}`);
    }
  }

  return { updated: anyUpdated, version: latestVersion, changelog };
}

const FETCH_TIMEOUT_MS  = 10_000;  // 10 seconds
const MAX_BODY_BYTES    = 512_000; // 512 KB — policy files are small

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      // Follow a single redirect (301/302/307/308)
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        req.destroy();
        fetchJson<T>(res.headers.location).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        req.destroy();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      let body = "";
      let bytes = 0;

      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          req.destroy();
          reject(new Error(`Response too large (> ${MAX_BODY_BYTES} bytes)`));
          return;
        }
        body += chunk.toString("utf-8");
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new Error("Invalid JSON from remote"));
        }
      });
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`));
    });

    req.on("error", reject);
  });
}

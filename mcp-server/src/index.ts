#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { complianceScan } from "./tools/scan";
import { complianceFix, complianceFixAll } from "./tools/fix";
import { complianceRefreshPolicies } from "./tools/refresh-policies";
import { upgradeLibraries } from "./tools/upgrade";
import { inspectApkTool }  from "./tools/inspect-apk";
import { getPolicyInfo }   from "./tools/policy-info";
import { isCacheStale } from "./policies/cache";

const server = new Server(
  { name: "claude-rn-compliance", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "compliance_scan",
      description:
        "Scan a React Native project for Android/iOS policy compliance violations. Returns a list of violations grouped by severity, plus any library upgrades required before fixes can be applied.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Absolute or relative path to the React Native project root.",
          },
          platforms: {
            type: "array",
            items: { type: "string", enum: ["android", "ios"] },
            description: "Platforms to scan. Defaults to both.",
          },
        },
        required: ["projectPath"],
      },
    },
    {
      name: "compliance_fix",
      description:
        "Apply fixes for specific compliance violation IDs. Creates .bak backups of all modified files.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Absolute or relative path to the React Native project root.",
          },
          violation_ids: {
            type: "array",
            items: { type: "string" },
            description: "List of policy violation IDs to fix (e.g. [\"android-16kb-page-size\"]).",
          },
        },
        required: ["projectPath", "violation_ids"],
      },
    },
    {
      name: "compliance_fix_all",
      description:
        "Apply all auto-fixable compliance violations found in the project. Scans first, then applies all fixes. Creates .bak backups of all modified files.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Absolute or relative path to the React Native project root.",
          },
        },
        required: ["projectPath"],
      },
    },
    {
      name: "compliance_refresh_policies",
      description:
        "Fetch the latest policy definitions from the remote source and update the local cache. Falls back to bundled policies if the network is unavailable.",
      inputSchema: {
        type: "object",
        properties: {
          remote_url: {
            type: "string",
            description: "Optional custom base URL for policy JSON files.",
          },
          platforms: {
            type: "array",
            items: { type: "string", enum: ["android", "ios"] },
            description: "Platforms to refresh. Defaults to both.",
          },
        },
      },
    },
    {
      name: "compliance_cache_status",
      description: "Check whether the local policy cache is stale (>24h old) for each platform.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "compliance_inspect_apk",
      description:
        "Inspect every native .so file in a built APK for 16 KB page-size compliance. Checks ELF PT_LOAD alignment and compression. Returns per-library results plus npm package upgrade suggestions for non-compliant libraries.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "React Native project root. Used for APK auto-discovery and package.json lookup.",
          },
          apkPath: {
            type: "string",
            description: "Explicit path to an APK file. If omitted, the tool auto-discovers one under android/app/build/outputs/apk/.",
          },
          variant: {
            type: "string",
            enum: ["debug", "release"],
            description: "Hint for auto-discovery when apkPath is omitted.",
          },
        },
        required: ["projectPath"],
      },
    },
    {
      name: "compliance_policy_info",
      description:
        "Return metadata about the currently loaded policy databases: versions, policy counts, cache age, and whether the remote cache or bundled policies are in use.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "compliance_upgrade_libraries",
      description:
        "Run package manager install commands to upgrade React Native libraries to their minimum 16 KB page-size compliant versions. Auto-detects npm / yarn / pnpm / bun from the project's lock file. Only call this tool after the user has explicitly confirmed they want to proceed.",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Absolute or relative path to the React Native project root.",
          },
          upgrades: {
            type: "array",
            description: "List of packages to upgrade.",
            items: {
              type: "object",
              properties: {
                name:        { type: "string", description: "npm package name, e.g. react-native-reanimated" },
                min_version: { type: "string", description: "Minimum compliant version, e.g. 3.6.0" },
              },
              required: ["name", "min_version"],
            },
          },
        },
        required: ["projectPath", "upgrades"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "compliance_scan": {
        const result = await complianceScan(
          args["projectPath"] as string,
          args["platforms"] as ["android", "ios"] | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_fix": {
        const result = await complianceFix(
          args["projectPath"] as string,
          args["violation_ids"] as string[]
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_fix_all": {
        const result = await complianceFixAll(args["projectPath"] as string);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_refresh_policies": {
        const result = await complianceRefreshPolicies(
          args["remote_url"] as string | undefined,
          args["platforms"] as ["android", "ios"] | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_cache_status": {
        const status = {
          android: { stale: isCacheStale("android") },
          ios: { stale: isCacheStale("ios") },
        };
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      }

      case "compliance_inspect_apk": {
        const result = await inspectApkTool(
          args["projectPath"] as string,
          args["apkPath"]     as string | undefined,
          args["variant"]     as string | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_policy_info": {
        const result = getPolicyInfo();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "compliance_upgrade_libraries": {
        const result = upgradeLibraries(
          args["projectPath"] as string,
          args["upgrades"] as Array<{ name: string; min_version: string }>
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("claude-rn-compliance MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

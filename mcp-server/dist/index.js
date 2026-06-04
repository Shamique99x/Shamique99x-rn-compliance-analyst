#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const scan_1 = require("./tools/scan");
const fix_1 = require("./tools/fix");
const refresh_policies_1 = require("./tools/refresh-policies");
const upgrade_1 = require("./tools/upgrade");
const inspect_apk_1 = require("./tools/inspect-apk");
const policy_info_1 = require("./tools/policy-info");
const cache_1 = require("./policies/cache");
const server = new index_js_1.Server({ name: "claude-rn-compliance", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "compliance_scan",
            description: "Scan a React Native project for Android/iOS policy compliance violations. Returns a list of violations grouped by severity, plus any library upgrades required before fixes can be applied.",
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
            description: "Apply fixes for specific compliance violation IDs. Creates .bak backups of all modified files.",
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
            description: "Apply all auto-fixable compliance violations found in the project. Scans first, then applies all fixes. Creates .bak backups of all modified files.",
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
            description: "Fetch the latest policy definitions from the remote source and update the local cache. Falls back to bundled policies if the network is unavailable.",
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
            description: "Inspect every native .so file in a built APK for 16 KB page-size compliance. Checks ELF PT_LOAD alignment and compression. Returns per-library results plus npm package upgrade suggestions for non-compliant libraries.",
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
            description: "Return metadata about the currently loaded policy databases: versions, policy counts, cache age, and whether the remote cache or bundled policies are in use.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "compliance_upgrade_libraries",
            description: "Run package manager install commands to upgrade React Native libraries to their minimum 16 KB page-size compliant versions. Auto-detects npm / yarn / pnpm / bun from the project's lock file. Only call this tool after the user has explicitly confirmed they want to proceed.",
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
                                name: { type: "string", description: "npm package name, e.g. react-native-reanimated" },
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
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
        switch (name) {
            case "compliance_scan": {
                const result = await (0, scan_1.complianceScan)(args["projectPath"], args["platforms"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_fix": {
                const result = await (0, fix_1.complianceFix)(args["projectPath"], args["violation_ids"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_fix_all": {
                const result = await (0, fix_1.complianceFixAll)(args["projectPath"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_refresh_policies": {
                const result = await (0, refresh_policies_1.complianceRefreshPolicies)(args["remote_url"], args["platforms"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_cache_status": {
                const status = {
                    android: { stale: (0, cache_1.isCacheStale)("android") },
                    ios: { stale: (0, cache_1.isCacheStale)("ios") },
                };
                return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
            }
            case "compliance_inspect_apk": {
                const result = await (0, inspect_apk_1.inspectApkTool)(args["projectPath"], args["apkPath"], args["variant"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_policy_info": {
                const result = (0, policy_info_1.getPolicyInfo)();
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "compliance_upgrade_libraries": {
                const result = (0, upgrade_1.upgradeLibraries)(args["projectPath"], args["upgrades"]);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("claude-rn-compliance MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
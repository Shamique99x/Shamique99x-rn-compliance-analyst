/**
 * Maps non-compliant native .so filenames found in an APK back to the npm
 * package that ships them, then cross-references the project's package.json
 * to produce specific upgrade suggestions.
 *
 * Two-tier lookup
 * ───────────────
 * 1. Static map  — policies/native-lib-map.json covers the most popular ~14
 *    React Native libraries with confirmed/community-reported minimum versions.
 *    Fast, offline, zero API cost.
 *
 * 2. Claude fallback — any .so not matched by the static map is sent to
 *    claude-haiku in a single batch call.  Claude draws on its training data
 *    about the React Native ecosystem to identify the npm package and the
 *    minimum version that ships 16 KB-aligned binaries.  Results are marked
 *    confidence="ai-identified" so developers know to verify.
 *    Requires ANTHROPIC_API_KEY.  Skipped gracefully if the key is absent.
 */

import * as fs   from "fs";
import * as path from "path";
import semver    from "semver";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { LibUpgrade } from "../../types";

// ── Mapping DB types ──────────────────────────────────────────────────────────

interface LibMapping {
  so_patterns: string[];
  npm_packages: string[];
  min_version: string;
  reason: string;
  docs_url: string;
  confidence: "confirmed" | "community-reported" | "estimated";
}

interface LibMapDatabase {
  version: string;
  mappings: LibMapping[];
}

// ── Public upgrade type ───────────────────────────────────────────────────────

export interface ApkLibUpgrade extends LibUpgrade {
  /** The .so filename that triggered this suggestion */
  triggered_by_so: string;
  /** ABI the non-compliant .so was found in, e.g. "arm64-v8a" */
  triggered_by_abi: string;
  confidence: "confirmed" | "community-reported" | "estimated" | "ai-identified" | "unknown";
}

// ── Static map loader ─────────────────────────────────────────────────────────

let _db: LibMapDatabase | null = null;

function loadDb(): LibMapDatabase {
  if (_db) return _db;
  const dbPath = path.resolve(__dirname, "../../..", "policies/native-lib-map.json");
  _db = JSON.parse(fs.readFileSync(dbPath, "utf-8")) as LibMapDatabase;
  return _db;
}

// ── .so name normalisation ────────────────────────────────────────────────────

function normalise(soName: string): string {
  return soName
    .toLowerCase()
    .replace(/^lib/, "")
    .replace(/\.so(\.[^.]+)?$/, "");
}

// ── Project deps reader ───────────────────────────────────────────────────────

type ProjectDeps = Record<string, string>;

function readProjectDeps(projectPath: string): ProjectDeps {
  const pkgFile = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgFile)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

// ── Claude fallback ───────────────────────────────────────────────────────────

interface ClaudeLibResult {
  so: string;
  npm_package: string | null;
  min_version: string | null;
  reason: string;
  docs_url: string | null;
}

/**
 * Ask Claude to identify npm packages and minimum 16 KB-compliant versions
 * for a batch of unknown .so filenames.  Returns an empty array if
 * ANTHROPIC_API_KEY is not set or the call fails.
 */
/**
 * AI fallback — tries Anthropic first, then Gemini, skips gracefully if neither key is set.
 */
async function lookupWithAI(soNames: string[]): Promise<ClaudeLibResult[]> {
  if (soNames.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) return [];

  const prompt = `You are an expert on the React Native ecosystem and Android native library packaging.

For each .so native library filename below, identify:
1. The npm package that ships it (if it is a React Native / JS ecosystem package)
2. The minimum version of that package that ships 16 KB page-aligned ELF binaries (required for Android 15+ with 16 KB memory pages)

Return ONLY a JSON array — no explanation, no markdown, no code fences.

Each element must be one of:
  { "so": "<name>", "npm_package": "<name>", "min_version": "<semver>", "reason": "<one sentence>", "docs_url": "<url or null>" }
  { "so": "<name>", "npm_package": null, "reason": "Android system library" }
  { "so": "<name>", "npm_package": null, "reason": "Unknown" }

Libraries to identify:
${soNames.map((n) => `  - ${n}`).join("\n")}`;

  try {
    let raw: string;

    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const block = message.content[0];
      if (!block || block.type !== "text") return [];
      raw = block.text.trim();
    } else {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!, { apiVersion: "v1" } as never);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim();
    }

    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(json) as ClaudeLibResult[];
  } catch {
    // Network error, quota, bad JSON — fail silently and let caller use "unknown"
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

interface NonCompliantLib {
  name: string;
  abi: string;
}

/**
 * Resolve upgrade suggestions for every non-compliant library.
 *
 * Static map is checked first (fast, offline).
 * Anything unrecognised is sent to Claude in one batch call.
 * Already-compliant-version packages are silently skipped.
 */
export async function resolveUpgrades(
  nonCompliantLibs: NonCompliantLib[],
  projectPath: string
): Promise<ApkLibUpgrade[]> {
  const db   = loadDb();
  const deps = readProjectDeps(projectPath);
  const seen = new Map<string, ApkLibUpgrade>();

  // Track which libs need the Claude fallback
  const unknownLibs: NonCompliantLib[] = [];

  // ── Pass 1: static map ────────────────────────────────────────────────────
  for (const lib of nonCompliantLibs) {
    const norm    = normalise(lib.name);
    const mapping = db.mappings.find((m) =>
      m.so_patterns.some((p) => norm.includes(p.toLowerCase()))
    );

    if (!mapping) {
      unknownLibs.push(lib);
      continue;
    }

    const installedPackage = mapping.npm_packages.find((p) => p in deps);
    const packageName      = installedPackage ?? mapping.npm_packages[0];
    const rawVersion       = deps[packageName];
    const currentVer       = rawVersion
      ? (semver.coerce(rawVersion)?.version ?? rawVersion)
      : "not installed";

    // Already compliant — skip silently
    if (
      currentVer !== "not installed" &&
      semver.valid(currentVer) &&
      semver.gte(currentVer, mapping.min_version)
    ) {
      continue;
    }

    if (!seen.has(packageName)) {
      seen.set(packageName, {
        name: packageName,
        current_version: currentVer,
        min_version: mapping.min_version,
        reason: mapping.reason,
        required_by_policy_ids: ["android-16kb-apk-verified"],
        triggered_by_so: lib.name,
        triggered_by_abi: lib.abi,
        confidence: mapping.confidence,
      });
    }
  }

  // ── Pass 2: Claude fallback for unknowns ──────────────────────────────────
  if (unknownLibs.length > 0) {
    const claudeResults = await lookupWithAI(unknownLibs.map((l) => l.name));
    const resultsByName = new Map(claudeResults.map((r) => [r.so, r]));

    for (const lib of unknownLibs) {
      const result = resultsByName.get(lib.name);

      // Claude recognised it as a real npm package with a known fix version
      if (result?.npm_package && result.min_version) {
        const packageName = result.npm_package;
        const rawVersion  = deps[packageName];
        const currentVer  = rawVersion
          ? (semver.coerce(rawVersion)?.version ?? rawVersion)
          : "not installed";

        // Already compliant — skip
        if (
          currentVer !== "not installed" &&
          semver.valid(currentVer) &&
          semver.gte(currentVer, result.min_version)
        ) {
          continue;
        }

        if (!seen.has(packageName)) {
          seen.set(packageName, {
            name: packageName,
            current_version: currentVer,
            min_version: result.min_version,
            reason: result.reason,
            required_by_policy_ids: ["android-16kb-apk-verified"],
            triggered_by_so: lib.name,
            triggered_by_abi: lib.abi,
            confidence: "ai-identified",
          });
        }
        continue;
      }

      // System library or truly unknown — report as-is so developer isn't left blind
      if (!result || result.reason === "Unknown") {
        const key = `unknown:${lib.name}`;
        if (!seen.has(key)) {
          seen.set(key, {
            name: lib.name,
            current_version: "unknown",
            min_version: "unknown",
            reason:
              `${lib.name} is not 16 KB page-aligned and could not be matched to a ` +
              `known npm package. Inspect the APK manually or check with the ` +
              `library maintainer.`,
            required_by_policy_ids: ["android-16kb-apk-verified"],
            triggered_by_so: lib.name,
            triggered_by_abi: lib.abi,
            confidence: "unknown",
          });
        }
      }
      // System library (Android/AOSP) — not an npm concern, skip silently
    }
  }

  return [...seen.values()];
}

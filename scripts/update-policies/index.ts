#!/usr/bin/env tsx
/**
 * Fetches official Android/iOS policy pages, uses Claude to extract the
 * current minimum version thresholds, and updates mcp-server/policies/*.json.
 *
 * Usage:
 *   npm start              # update policies in place
 *   npm run dry-run        # print changes without writing files
 *
 * Env vars:
 *   ANTHROPIC_API_KEY      required
 *   POLICIES_DIR           path to mcp-server/policies/ (defaults to ../../mcp-server/policies)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as path from "path";
import { URL } from "url";

const POLICIES_DIR =
  process.env.POLICIES_DIR ??
  path.resolve(__dirname, "../../mcp-server/policies");

const DRY_RUN = process.argv.includes("--dry-run");

// Official sources — these pages contain the authoritative version requirements
const ANDROID_SOURCES = [
  "https://developer.android.com/google/play/requirements/target-sdk",
  "https://developer.android.com/guide/practices/page-sizes",
];
const IOS_SOURCES = [
  "https://developer.apple.com/news/upcoming-requirements/",
  "https://developer.apple.com/documentation/bundleresources/privacy-manifest-files",
];

interface PolicyThresholds {
  android_target_sdk_min: number | null;
  android_compile_sdk_min: number | null;
  android_agp_min: string | null;
  android_gradle_min: string | null;
  ios_deployment_target_min: string | null;
  ios_xcode_min: string | null;
  version_label: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchUrl(url: string, redirectsLeft = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;

    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; rn-compliance-policy-updater/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          fetchUrl(next, redirectsLeft - 1).then(resolve).catch(reject);
          res.resume();
          return;
        }

        if (!res.statusCode || res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          res.resume();
          return;
        }

        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      }
    );

    req.on("error", reject);
    req.setTimeout(20_000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<(br|p|div|h[1-6]|li|tr|td|th)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Keep the most policy-relevant content by looking for sections that mention
// version numbers, SDK levels, and deadlines.
function extractRelevantContent(text: string, maxChars = 6000): string {
  if (text.length <= maxChars) return text;

  // Score each paragraph by how many version/deadline keywords it contains
  const paragraphs = text.split(/\n{2,}/);
  const keywords = /\b(sdk|api level|target|compile|xcode|deployment|minimum|require|version|agp|gradle|2024|2025|2026|deadline|must|mandate)\b/gi;

  const scored = paragraphs.map((p) => ({
    text: p,
    score: (p.match(keywords) ?? []).length,
  }));

  scored.sort((a, b) => b.score - a.score);

  let result = "";
  for (const { text: p } of scored) {
    if (result.length + p.length > maxChars) break;
    result += p + "\n\n";
  }
  return result.trim();
}

// ---------------------------------------------------------------------------
// Claude extraction
// ---------------------------------------------------------------------------

async function extractThresholds(
  androidTexts: string[],
  iosTexts: string[]
): Promise<PolicyThresholds> {
  const androidContent = androidTexts
    .map((t, i) => `--- Android Source ${i + 1} ---\n${extractRelevantContent(t)}`)
    .join("\n\n");

  const iosContent = iosTexts
    .map((t, i) => `--- iOS Source ${i + 1} ---\n${extractRelevantContent(t)}`)
    .join("\n\n");

  const currentQuarter = `${new Date().getFullYear()}-Q${Math.ceil(
    (new Date().getMonth() + 1) / 3
  )}`;

  const prompt = `You are a mobile app policy analyst. Extract the current minimum version requirements for React Native apps publishing to the Google Play Store and Apple App Store.

CRITICAL INSTRUCTION: Your entire response must be a single raw JSON object. No markdown, no bullet points, no explanation text, no code fences, no backticks. Start your response with { and end with }. Nothing before the opening brace, nothing after the closing brace.

Use this exact shape (use null for any field not explicitly stated in the docs):
{
  "android_target_sdk_min": <integer — Google Play minimum targetSdkVersion API level>,
  "android_compile_sdk_min": <integer — minimum compileSdkVersion>,
  "android_agp_min": "<semver — Android Gradle Plugin minimum>",
  "android_gradle_min": "<semver — Gradle wrapper minimum>",
  "ios_deployment_target_min": "<version string — minimum iOS deployment target, e.g. 15.1>",
  "ios_xcode_min": "<version string — minimum Xcode for App Store submission, e.g. 16.0>",
  "version_label": "${currentQuarter}",
  "notes": "<one sentence about the most important upcoming deadline, or null>"
}

=== ANDROID OFFICIAL DOCS ===
${androidContent}

=== iOS OFFICIAL DOCS ===
${iosContent}`;

  let raw: string;

  // Trim keys — GitHub Actions sets unset secrets to "" not undefined
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const geminiKey    = process.env.GEMINI_API_KEY?.trim();

  console.log(`  ANTHROPIC_API_KEY set: ${!!anthropicKey}`);
  console.log(`  GEMINI_API_KEY set: ${!!geminiKey}`);

  if (anthropicKey) {
    // Prefer Anthropic if key is available
    console.log("  Using Anthropic (claude-sonnet-4-5)...");
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") throw new Error("Unexpected Anthropic response shape");
    raw = block.text.trim();
  } else if (geminiKey) {
    // Fall back to Gemini — try models in order until one responds successfully.
    // gemini-2.0-flash is preferred; gemini-2.0-flash-lite is the fallback.
    // Note: if ALL models return quota/404 errors your Google Cloud project likely
    // needs billing enabled even for free-tier usage — see:
    // https://aistudio.google.com/apikey → click project → Enable billing
    // Try models in order — gemini-flash-latest is the stable free-tier alias.
    // Auth via X-goog-api-key header (more reliable than ?key= query param).
    const GEMINI_MODELS = [
      "gemini-flash-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
    ];

    let lastError = "";
    raw = "";

    for (const modelName of GEMINI_MODELS) {
      console.log(`  Trying Gemini model: ${modelName}...`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048 },
          }),
        }
      );
      if (!res.ok) {
        const errBody = await res.text();
        lastError = `${modelName}: HTTP ${res.status} — ${errBody.slice(0, 300)}`;
        console.log(`  ✗ ${lastError}`);
        continue;
      }
      const data = await res.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (raw) {
        console.log(`  ✓ Success with ${modelName}`);
        break;
      }
    }

    if (!raw) {
      throw new Error(
        `All Gemini models failed. Last error: ${lastError}\n\n` +
        `If you see quota errors, your Google Cloud project likely needs billing enabled:\n` +
        `  1. Go to https://aistudio.google.com/apikey\n` +
        `  2. Click the project name next to your key\n` +
        `  3. Enable billing (free tier still applies — no charges for normal usage)\n` +
        `Or set the ANTHROPIC_API_KEY secret instead.`
      );
    }
  } else {
    throw new Error(
      "No AI API key found. Set either ANTHROPIC_API_KEY or GEMINI_API_KEY in repository secrets."
    );
  }

  // Strip code fences first, then extract the outermost {...} block.
  // This tolerates models that wrap JSON in markdown prose despite instructions.
  const stripped = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`AI returned non-JSON response:\n${raw.slice(0, 500)}`);
  }
  try {
    return JSON.parse(match[0]) as PolicyThresholds;
  } catch {
    throw new Error(`AI returned malformed JSON:\n${match[0].slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------------
// Apply thresholds to existing policy JSON
// ---------------------------------------------------------------------------

function set(
  changes: string[],
  label: string,
  obj: Record<string, unknown>,
  key: string,
  newVal: unknown
): void {
  if (newVal !== null && newVal !== undefined && obj[key] !== newVal) {
    changes.push(`  ${label}: ${JSON.stringify(obj[key])} → ${JSON.stringify(newVal)}`);
    obj[key] = newVal;
  }
}

function applyThresholds(
  androidDb: Record<string, unknown>,
  iosDb: Record<string, unknown>,
  t: PolicyThresholds
): { androidDb: Record<string, unknown>; iosDb: Record<string, unknown>; changes: string[] } {
  const changes: string[] = [];
  const androidPolicies = androidDb.policies as Record<string, unknown>[];
  const iosPolicies = iosDb.policies as Record<string, unknown>[];

  // version label
  if (t.version_label) {
    set(changes, "android.version", androidDb, "version", t.version_label);
    set(changes, "ios.version", iosDb, "version", t.version_label);
  }

  // android-target-sdk
  const targetSdk = androidPolicies?.find((p) => p.id === "android-target-sdk") as
    | Record<string, unknown>
    | undefined;
  if (targetSdk && t.android_target_sdk_min) {
    const sdkMin = t.android_target_sdk_min;
    const compileMin = t.android_compile_sdk_min ?? sdkMin;
    const checks = (targetSdk.check as Record<string, unknown>)
      ?.checks as Record<string, unknown>[];
    const fixChanges = (targetSdk.fix as Record<string, unknown>)
      ?.changes as Record<string, unknown>[];

    if (checks?.[0]) set(changes, "android-target-sdk check[0].min_value", checks[0], "min_value", sdkMin);
    if (checks?.[1]) set(changes, "android-target-sdk check[1].min_value", checks[1], "min_value", compileMin);
    if (fixChanges?.[0]) set(changes, "android-target-sdk fix[0].value", fixChanges[0], "value", sdkMin);
    if (fixChanges?.[1]) set(changes, "android-target-sdk fix[1].value", fixChanges[1], "value", compileMin);
  }

  // android-agp-version
  const agp = androidPolicies?.find((p) => p.id === "android-agp-version") as
    | Record<string, unknown>
    | undefined;
  if (agp && t.android_agp_min) {
    const check = agp.check as Record<string, unknown>;
    const fix = agp.fix as Record<string, unknown>;
    if (check) set(changes, "android-agp check.min_version", check, "min_version", t.android_agp_min);
    if (fix) set(changes, "android-agp fix.version", fix, "version", t.android_agp_min);
  }

  // android-gradle-wrapper
  const gradle = androidPolicies?.find((p) => p.id === "android-gradle-wrapper") as
    | Record<string, unknown>
    | undefined;
  if (gradle && t.android_gradle_min) {
    const check = gradle.check as Record<string, unknown>;
    const fix = gradle.fix as Record<string, unknown>;
    if (check) set(changes, "android-gradle check.min_version", check, "min_version", t.android_gradle_min);
    if (fix?.value) {
      const newUrl = (fix.value as string).replace(
        /gradle-[\d.]+-all\.zip/,
        `gradle-${t.android_gradle_min}-all.zip`
      );
      set(changes, "android-gradle fix.value", fix, "value", newUrl);
    }
  }

  // ios-min-deployment-target
  const iosTarget = iosPolicies?.find((p) => p.id === "ios-min-deployment-target") as
    | Record<string, unknown>
    | undefined;
  if (iosTarget && t.ios_deployment_target_min) {
    const v = t.ios_deployment_target_min;
    const checks = (iosTarget.check as Record<string, unknown>)
      ?.checks as Record<string, unknown>[];
    const fixChanges = (iosTarget.fix as Record<string, unknown>)
      ?.changes as Record<string, unknown>[];

    if (checks?.[0]) set(changes, "ios-deployment-target check[0].min_version", checks[0], "min_version", v);
    if (checks?.[1]) set(changes, "ios-deployment-target check[1].min_version", checks[1], "min_version", v);
    if (fixChanges?.[0]) set(changes, "ios-deployment-target fix[0].version", fixChanges[0], "version", v);
    if (fixChanges?.[1]) set(changes, "ios-deployment-target fix[1].value", fixChanges[1], "value", v);
  }

  // ios-xcode-version
  const iosXcode = iosPolicies?.find((p) => p.id === "ios-xcode-version") as
    | Record<string, unknown>
    | undefined;
  if (iosXcode && t.ios_xcode_min) {
    const check = iosXcode.check as Record<string, unknown>;
    if (check) set(changes, "ios-xcode check.min_version", check, "min_version", t.ios_xcode_min);
  }

  return { androidDb, iosDb, changes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching official policy pages...\n");

  const [androidTexts, iosTexts] = await Promise.all([
    Promise.all(
      ANDROID_SOURCES.map(async (url) => {
        process.stdout.write(`  GET ${url} ... `);
        try {
          const text = htmlToText(await fetchUrl(url));
          console.log(`OK (${text.length} chars)`);
          return text;
        } catch (err) {
          console.log(`FAILED: ${(err as Error).message}`);
          return "";
        }
      })
    ),
    Promise.all(
      IOS_SOURCES.map(async (url) => {
        process.stdout.write(`  GET ${url} ... `);
        try {
          const text = htmlToText(await fetchUrl(url));
          console.log(`OK (${text.length} chars)`);
          return text;
        } catch (err) {
          console.log(`FAILED: ${(err as Error).message}`);
          return "";
        }
      })
    ),
  ]);

  const validAndroid = androidTexts.filter(Boolean);
  const validIos = iosTexts.filter(Boolean);

  if (validAndroid.length === 0 && validIos.length === 0) {
    throw new Error("All page fetches failed — cannot update policies safely");
  }

  const aiProvider = process.env.ANTHROPIC_API_KEY?.trim() ? "Anthropic" : process.env.GEMINI_API_KEY?.trim() ? "Gemini" : "none";
  console.log(`\nExtracting thresholds (provider: ${aiProvider})...`);
  const thresholds = await extractThresholds(validAndroid, validIos);

  console.log("\nExtracted thresholds:");
  const display = { ...thresholds };
  delete display.notes;
  console.log(JSON.stringify(display, null, 2));
  if (thresholds.notes) console.log(`\nNotes: ${thresholds.notes}`);

  const androidPath = path.join(POLICIES_DIR, "android.json");
  const iosPath = path.join(POLICIES_DIR, "ios.json");

  const androidDb = JSON.parse(fs.readFileSync(androidPath, "utf-8")) as Record<string, unknown>;
  const iosDb = JSON.parse(fs.readFileSync(iosPath, "utf-8")) as Record<string, unknown>;

  const { androidDb: updatedAndroid, iosDb: updatedIos, changes } = applyThresholds(
    androidDb,
    iosDb,
    thresholds
  );

  if (changes.length === 0) {
    console.log("\nNo changes needed — policies are already up to date.");
    return;
  }

  console.log(`\nChanges (${changes.length}):`);
  for (const c of changes) console.log(c);

  if (DRY_RUN) {
    console.log("\n[dry-run] Skipping file writes.");
    return;
  }

  fs.writeFileSync(androidPath, JSON.stringify(updatedAndroid, null, 2) + "\n", "utf-8");
  fs.writeFileSync(iosPath, JSON.stringify(updatedIos, null, 2) + "\n", "utf-8");

  console.log(`\nUpdated:\n  ${androidPath}\n  ${iosPath}`);
}

main().catch((err) => {
  console.error("\nERROR:", (err as Error).message);
  process.exit(1);
});

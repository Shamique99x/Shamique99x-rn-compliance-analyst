"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanDeploymentTarget = scanDeploymentTarget;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver_1 = __importDefault(require("semver"));
const MIN_IOS_VERSION = "15.1";
function findPbxproj(iosDir) {
    try {
        for (const entry of fs.readdirSync(iosDir)) {
            if (entry.endsWith(".xcodeproj")) {
                const candidate = path.join(iosDir, entry, "project.pbxproj");
                if (fs.existsSync(candidate))
                    return candidate;
            }
        }
    }
    catch { /* ignore */ }
    return null;
}
async function scanDeploymentTarget(projectPath) {
    const violations = [];
    violations.push(...checkPodfile(projectPath));
    violations.push(...(await checkPbxproj(projectPath)));
    violations.push(...checkXcodeVersion(projectPath));
    return violations;
}
function checkPodfile(projectPath) {
    const file = path.join(projectPath, "ios", "Podfile");
    if (!fs.existsSync(file))
        return [];
    const content = fs.readFileSync(file, "utf-8");
    const match = content.match(/platform\s+:ios\s*,\s*['"](\d+\.\d+(?:\.\d+)?)['"]/);
    if (!match) {
        return [
            {
                policy_id: "ios-min-deployment-target",
                policy_name: "Minimum iOS Deployment Target",
                platform: "ios",
                severity: "error",
                auto_fixable: true,
                description: `iOS minimum deployment target must be >= ${MIN_IOS_VERSION}.`,
                docs_url: "https://reactnative.dev/docs/environment-setup",
                details: "Could not find platform :ios version in Podfile.",
                affected_files: ["ios/Podfile"],
            },
        ];
    }
    const current = match[1];
    if (!semver_1.default.lt(semver_1.default.coerce(current), semver_1.default.coerce(MIN_IOS_VERSION)))
        return [];
    return [
        {
            policy_id: "ios-min-deployment-target",
            policy_name: "Minimum iOS Deployment Target",
            platform: "ios",
            severity: "error",
            auto_fixable: true,
            description: `iOS minimum deployment target must be >= ${MIN_IOS_VERSION}.`,
            docs_url: "https://reactnative.dev/docs/environment-setup",
            details: `Podfile sets platform :ios, '${current}' — must be >= ${MIN_IOS_VERSION}.`,
            affected_files: ["ios/Podfile"],
        },
    ];
}
async function checkPbxproj(projectPath) {
    const iosDir = path.join(projectPath, "ios");
    if (!fs.existsSync(iosDir))
        return [];
    const pbxprojPath = findPbxproj(iosDir);
    if (!pbxprojPath || !fs.existsSync(pbxprojPath))
        return [];
    const content = fs.readFileSync(pbxprojPath, "utf-8");
    const matches = [...content.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+\.\d+)/g)];
    if (matches.length === 0)
        return [];
    const outdated = matches.filter((m) => semver_1.default.lt(semver_1.default.coerce(m[1]), semver_1.default.coerce(MIN_IOS_VERSION)));
    if (outdated.length === 0)
        return [];
    const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
    return [
        {
            policy_id: "ios-min-deployment-target",
            policy_name: "Minimum iOS Deployment Target",
            platform: "ios",
            severity: "error",
            auto_fixable: true,
            description: `IPHONEOS_DEPLOYMENT_TARGET in Xcode project must be >= ${MIN_IOS_VERSION}.`,
            docs_url: "https://reactnative.dev/docs/environment-setup",
            details: `${outdated.length} build configuration(s) set IPHONEOS_DEPLOYMENT_TARGET below ${MIN_IOS_VERSION}.`,
            affected_files: [relPath],
        },
    ];
}
function checkXcodeVersion(projectPath) {
    for (const candidate of [".xcode-version", "ios/.xcode-version"]) {
        const file = path.join(projectPath, candidate);
        if (!fs.existsSync(file))
            continue;
        const content = fs.readFileSync(file, "utf-8").trim();
        const versionMatch = content.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (!versionMatch)
            continue;
        const current = versionMatch[1];
        if (semver_1.default.lt(semver_1.default.coerce(current), semver_1.default.coerce("16.0"))) {
            return [
                {
                    policy_id: "ios-xcode-version",
                    policy_name: "Xcode Version Requirement",
                    platform: "ios",
                    severity: "warning",
                    auto_fixable: false,
                    description: "Apple requires Xcode 16+ for App Store submissions (since April 2025).",
                    docs_url: "https://developer.apple.com/news/upcoming-requirements/",
                    details: `${candidate} specifies Xcode ${current}. Upgrade to Xcode 16.0 or later.`,
                    affected_files: [candidate],
                },
            ];
        }
    }
    return [];
}
//# sourceMappingURL=deployment-target.js.map
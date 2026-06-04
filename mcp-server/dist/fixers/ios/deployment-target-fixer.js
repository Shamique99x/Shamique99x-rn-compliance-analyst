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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixDeploymentTarget = fixDeploymentTarget;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const TARGET_IOS = "15.1";
async function fixDeploymentTarget(projectPath) {
    const changes = [];
    fixPodfile(projectPath, changes);
    await fixPbxproj(projectPath, changes);
    return { violation_id: "ios-min-deployment-target", success: true, changes };
}
function fixPodfile(projectPath, changes) {
    const file = path.join(projectPath, "ios", "Podfile");
    if (!fs.existsSync(file))
        return;
    let content = fs.readFileSync(file, "utf-8");
    const regex = /platform\s+:ios\s*,\s*['"](\d+\.\d+(?:\.\d+)?)['"]/;
    const match = content.match(regex);
    if (!match) {
        content = `platform :ios, '${TARGET_IOS}'\n` + content;
    }
    else if (isOlderThan(match[1], TARGET_IOS)) {
        content = content.replace(regex, `platform :ios, '${TARGET_IOS}'`);
    }
    else {
        return;
    }
    const backup = (0, utils_1.backupAndWrite)(file, content);
    changes.push({
        file: "ios/Podfile",
        description: `Updated platform :ios to '${TARGET_IOS}'`,
        backup_path: backup,
    });
}
async function fixPbxproj(projectPath, changes) {
    const iosDir = path.join(projectPath, "ios");
    if (!fs.existsSync(iosDir))
        return;
    let pbxprojPath = null;
    try {
        for (const entry of fs.readdirSync(iosDir)) {
            if (entry.endsWith(".xcodeproj")) {
                const candidate = path.join(iosDir, entry, "project.pbxproj");
                if (fs.existsSync(candidate)) {
                    pbxprojPath = candidate;
                    break;
                }
            }
        }
    }
    catch {
        return;
    }
    if (!pbxprojPath || !fs.existsSync(pbxprojPath))
        return;
    let content = fs.readFileSync(pbxprojPath, "utf-8");
    let modified = false;
    content = content.replace(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(\d+\.\d+)/g, (match, ver) => {
        if (isOlderThan(ver, TARGET_IOS)) {
            modified = true;
            return match.replace(ver, TARGET_IOS);
        }
        return match;
    });
    if (modified) {
        const relPath = path.relative(projectPath, pbxprojPath).replace(/\\/g, "/");
        const backup = (0, utils_1.backupAndWrite)(pbxprojPath, content);
        changes.push({
            file: relPath,
            description: `Set IPHONEOS_DEPLOYMENT_TARGET to ${TARGET_IOS} in all build configurations`,
            backup_path: backup,
        });
    }
}
function isOlderThan(current, target) {
    const parse = (v) => v.split(".").map(Number);
    const [ca, cb] = parse(current);
    const [ta, tb] = parse(target);
    if (ca !== ta)
        return ca < ta;
    return cb < tb;
}
//# sourceMappingURL=deployment-target-fixer.js.map
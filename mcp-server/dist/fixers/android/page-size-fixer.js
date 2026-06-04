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
exports.fixPageSize = fixPageSize;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
function fixPageSize(projectPath) {
    const changes = [];
    const propsFile = path.join(projectPath, "android", "gradle.properties");
    const buildFile = path.join(projectPath, "android", "app", "build.gradle");
    const cmakeFile = path.join(projectPath, "android", "app", "CMakeLists.txt");
    // 1. gradle.properties — add enableUncompressedNativeLibs
    {
        let content = fs.existsSync(propsFile) ? fs.readFileSync(propsFile, "utf-8") : "";
        if (!/android\.bundle\.enableUncompressedNativeLibs\s*=/.test(content)) {
            content = content.trimEnd() + "\nandroid.bundle.enableUncompressedNativeLibs=true\n";
            const backup = (0, utils_1.backupAndWrite)(propsFile, content);
            changes.push({
                file: "android/gradle.properties",
                description: "Added android.bundle.enableUncompressedNativeLibs=true",
                backup_path: backup,
            });
        }
        else if (!/android\.bundle\.enableUncompressedNativeLibs\s*=\s*true/.test(content)) {
            content = content.replace(/android\.bundle\.enableUncompressedNativeLibs\s*=\s*\S+/, "android.bundle.enableUncompressedNativeLibs=true");
            const backup = (0, utils_1.backupAndWrite)(propsFile, content);
            changes.push({
                file: "android/gradle.properties",
                description: "Set android.bundle.enableUncompressedNativeLibs to true",
                backup_path: backup,
            });
        }
    }
    // 2. build.gradle — add cmake argument inside externalNativeBuild/cmake block
    if (fs.existsSync(buildFile)) {
        let content = fs.readFileSync(buildFile, "utf-8");
        if (!content.includes("-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON")) {
            content = injectCmakeArg(content, "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON");
            const backup = (0, utils_1.backupAndWrite)(buildFile, content);
            changes.push({
                file: "android/app/build.gradle",
                description: "Added -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON to cmake arguments",
                backup_path: backup,
            });
        }
    }
    // 3. CMakeLists.txt — add linker flag (only if file exists)
    if (fs.existsSync(cmakeFile)) {
        let content = fs.readFileSync(cmakeFile, "utf-8");
        if (!content.includes("-Wl,-z,max-page-size=16384")) {
            content = injectCmakeLinkerFlag(content, "-Wl,-z,max-page-size=16384");
            const backup = (0, utils_1.backupAndWrite)(cmakeFile, content);
            changes.push({
                file: "android/app/CMakeLists.txt",
                description: "Added -Wl,-z,max-page-size=16384 linker flag",
                backup_path: backup,
            });
        }
    }
    return { violation_id: "android-16kb-page-size", success: true, changes };
}
function injectCmakeArg(content, arg) {
    // If an arguments(...) line exists inside a cmake { } block, append to the LAST quoted token.
    // Handles both single-arg: arguments "-DFOO=1"
    // and multi-arg:           arguments "-DFOO=1", "-DBAR=2"
    // We match everything from `arguments` up to the final closing quote on that line.
    const argsRegex = /(cmake\s*\{[^}]*?arguments\s+(?:"[^"]*"(?:\s*,\s*"[^"]*")*\s*,\s*)?)("[^"]*")/s;
    if (argsRegex.test(content)) {
        return content.replace(argsRegex, `$1$2, "${arg}"`);
    }
    // If cmake { } block exists but no arguments line, inject one
    const cmakeBlockRegex = /(cmake\s*\{)/;
    if (cmakeBlockRegex.test(content)) {
        return content.replace(cmakeBlockRegex, `$1\n                arguments "${arg}"`);
    }
    // No cmake block — inject externalNativeBuild block inside defaultConfig { }
    const defaultConfigRegex = /(defaultConfig\s*\{)/;
    if (defaultConfigRegex.test(content)) {
        return content.replace(defaultConfigRegex, `$1\n        externalNativeBuild {\n            cmake {\n                arguments "${arg}"\n            }\n        }`);
    }
    return content;
}
function injectCmakeLinkerFlag(content, flag) {
    // Append to existing target_link_options call if present
    const tloRegex = /(target_link_options\([^)]+)(PRIVATE)([^)]*)\)/;
    if (tloRegex.test(content)) {
        return content.replace(tloRegex, `$1$2$3 "${flag}")`);
    }
    // Append a new target_link_options at end of file
    const targetMatch = content.match(/add_library\((\w+)/);
    const targetName = targetMatch ? targetMatch[1] : "${PROJECT_NAME}";
    return content.trimEnd() + `\ntarget_link_options(${targetName} PRIVATE "${flag}")\n`;
}
//# sourceMappingURL=page-size-fixer.js.map
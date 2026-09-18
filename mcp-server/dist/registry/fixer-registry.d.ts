/**
 * Fixer Registry
 *
 * Maps JSON policy fix types and policy IDs to TypeScript fixer
 * implementations. The engine in fix-runner.ts handles all generic fix
 * types (properties_set, gradle_cmake_arg_append, etc.). This registry
 * documents the custom fixers that require code-level logic.
 */
import { FixResult } from "../types";
export type SyncFixer = (projectPath: string) => FixResult;
export type SyncMultiFixer = (projectPath: string) => FixResult[];
export type AsyncFixer = (projectPath: string) => Promise<FixResult>;
export type AnyFixer = SyncFixer | SyncMultiFixer | AsyncFixer;
/**
 * Custom fixers keyed by their logical name.
 * Check the individual fixer's return type before calling.
 */
export declare const FIXER_REGISTRY: Record<string, AnyFixer>;
/** Resolve a fixer by name. Returns undefined if not registered. */
export declare function getFixer(name: string): AnyFixer | undefined;
//# sourceMappingURL=fixer-registry.d.ts.map
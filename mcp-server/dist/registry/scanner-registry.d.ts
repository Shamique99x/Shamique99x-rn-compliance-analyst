/**
 * Scanner Registry
 *
 * Maps policy IDs to TypeScript scanner implementations.
 * The engine in check-runner.ts handles all generic check types
 * (file_exists, gradle_int_property, etc.). This registry covers
 * only the custom scanners that require code-level logic.
 *
 * Note: Capacitor is not supported in the Claude Code plugin.
 * See BUS-Apps-Compliance for the full React Native + Capacitor version.
 */
import { Violation } from "../types";
export type SyncScanner = (projectPath: string) => Violation[];
export type AsyncScanner = (projectPath: string) => Promise<Violation[]>;
export type AnyScanner = SyncScanner | AsyncScanner;
/** Custom scanners keyed by their logical name. */
export declare const SCANNER_REGISTRY: Record<string, AnyScanner>;
/** Resolve a scanner by name. Returns undefined if not registered. */
export declare function getScanner(name: string): AnyScanner | undefined;
//# sourceMappingURL=scanner-registry.d.ts.map
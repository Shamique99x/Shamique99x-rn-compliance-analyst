/**
 * Minimal ELF parser — reads PT_LOAD segment alignments only.
 *
 * We care about one thing: every PT_LOAD segment in a shared library must
 * have p_align >= 16384 (0x4000) to be compatible with Android's 16 KB
 * memory page size.  Anything lower means the OS cannot memory-map the
 * library on a 16 KB device and will crash at load time.
 *
 * References:
 *   https://developer.android.com/guide/practices/page-sizes
 *   https://refspecs.linuxbase.org/elf/elf.pdf  (ELF-64 Object File Format)
 */
export declare const PAGE_4KB = 4096;
export declare const PAGE_16KB = 16384;
export interface ElfInfo {
    is64bit: boolean;
    /** Minimum p_align value across all PT_LOAD segments. */
    minLoadAlignment: number;
    /** Every PT_LOAD segment alignment, for detailed reporting. */
    loadAlignments: number[];
}
/**
 * Parse ELF program headers from `buf` (the raw bytes of a .so file).
 * Returns null if `buf` is not a valid ELF binary or has too few headers.
 */
export declare function parseElf(buf: Buffer): ElfInfo | null;
//# sourceMappingURL=elf-parser.d.ts.map
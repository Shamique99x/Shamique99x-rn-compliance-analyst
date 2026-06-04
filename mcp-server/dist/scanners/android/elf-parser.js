"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_16KB = exports.PAGE_4KB = void 0;
exports.parseElf = parseElf;
exports.PAGE_4KB = 4096; // 0x1000 — old default, non-compliant
exports.PAGE_16KB = 16384; // 0x4000 — required for Android 15+
/**
 * Parse ELF program headers from `buf` (the raw bytes of a .so file).
 * Returns null if `buf` is not a valid ELF binary or has too few headers.
 */
function parseElf(buf) {
    // Need at least the full ELF identifier + e_type … e_phnum
    if (buf.length < 64)
        return null;
    // Magic: 0x7f 'E' 'L' 'F'
    if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
        return null;
    }
    const is64bit = buf[4] === 2; // EI_CLASS: 1 = 32-bit, 2 = 64-bit
    const isLE = buf[5] === 1; // EI_DATA:  1 = little-endian
    if (!isLE)
        return null; // ARM/AArch64 are always LE; skip exotic BE targets
    let phoff;
    let phentsize;
    let phnum;
    if (is64bit) {
        // e_phoff @ 32 as uint64 — guard against values that exceed JS safe integer range
        const rawPhoff = buf.readBigUInt64LE(32);
        if (rawPhoff > BigInt(buf.length))
            return null; // sanity: offset can't exceed file size
        phoff = Number(rawPhoff);
        phentsize = buf.readUInt16LE(54);
        phnum = buf.readUInt16LE(56);
    }
    else {
        phoff = buf.readUInt32LE(28);
        phentsize = buf.readUInt16LE(42);
        phnum = buf.readUInt16LE(44);
    }
    if (phnum === 0 || phoff === 0)
        return null;
    const PT_LOAD = 1;
    const loadAlignments = [];
    for (let i = 0; i < phnum; i++) {
        const base = phoff + i * phentsize;
        if (base + phentsize > buf.length)
            break;
        const type = buf.readUInt32LE(base);
        if (type !== PT_LOAD)
            continue;
        // p_align offset differs between 32-bit and 64-bit program headers:
        //   64-bit: p_align @ base+48  (uint64)
        //   32-bit: p_align @ base+28  (uint32)
        const align = is64bit
            ? Number(buf.readBigUInt64LE(base + 48))
            : buf.readUInt32LE(base + 28);
        loadAlignments.push(align);
    }
    if (loadAlignments.length === 0)
        return null;
    return {
        is64bit,
        minLoadAlignment: Math.min(...loadAlignments),
        loadAlignments,
    };
}
//# sourceMappingURL=elf-parser.js.map
import { parseElf, PAGE_4KB, PAGE_16KB } from "../src/scanners/android/elf-parser";

/** Build a minimal valid 64-bit LE ELF with one PT_LOAD segment at `align`. */
function make64bitElf(align: number): Buffer {
  const EHDR = 64;
  const PHDR = 56;
  const buf = Buffer.alloc(EHDR + PHDR, 0);

  // ELF identifier
  buf.writeUInt32BE(0x7f454c46, 0); // magic
  buf[4] = 2;  // 64-bit
  buf[5] = 1;  // LE
  buf[6] = 1;  // ELF version
  buf[7] = 0;  // OS/ABI = System V

  // e_type = ET_DYN (3)
  buf.writeUInt16LE(3, 16);
  // e_machine = EM_AARCH64 (183)
  buf.writeUInt16LE(183, 18);
  // e_version = 1
  buf.writeUInt32LE(1, 20);
  // e_phoff = 64 (program headers start right after ELF header)
  buf.writeBigUInt64LE(BigInt(EHDR), 32);
  // e_ehsize = 64
  buf.writeUInt16LE(EHDR, 52);
  // e_phentsize = 56
  buf.writeUInt16LE(PHDR, 54);
  // e_phnum = 1
  buf.writeUInt16LE(1, 56);

  // Program header: PT_LOAD
  const ph = EHDR;
  buf.writeUInt32LE(1, ph);               // p_type = PT_LOAD
  buf.writeUInt32LE(5, ph + 4);           // p_flags = R|X
  buf.writeBigUInt64LE(BigInt(0), ph + 8);      // p_offset
  buf.writeBigUInt64LE(BigInt(0), ph + 16);     // p_vaddr
  buf.writeBigUInt64LE(BigInt(0), ph + 24);     // p_paddr
  buf.writeBigUInt64LE(BigInt(0x1000), ph + 32); // p_filesz
  buf.writeBigUInt64LE(BigInt(0x1000), ph + 40); // p_memsz
  buf.writeBigUInt64LE(BigInt(align), ph + 48);  // p_align ← the value we test

  return buf;
}

/** Build a minimal valid 32-bit LE ELF with one PT_LOAD segment at `align`. */
function make32bitElf(align: number): Buffer {
  const EHDR = 52;
  const PHDR = 32;
  const buf = Buffer.alloc(EHDR + PHDR, 0);

  buf.writeUInt32BE(0x7f454c46, 0);
  buf[4] = 1;  // 32-bit
  buf[5] = 1;  // LE
  buf[6] = 1;
  buf[7] = 0;

  buf.writeUInt16LE(3, 16);   // ET_DYN
  buf.writeUInt16LE(40, 18);  // EM_ARM
  buf.writeUInt32LE(1, 20);
  buf.writeUInt32LE(EHDR, 28);  // e_phoff
  buf.writeUInt16LE(EHDR, 40);  // e_ehsize
  buf.writeUInt16LE(PHDR, 42);  // e_phentsize
  buf.writeUInt16LE(1, 44);     // e_phnum

  const ph = EHDR;
  buf.writeUInt32LE(1, ph);            // p_type = PT_LOAD
  buf.writeUInt32LE(0, ph + 4);        // p_offset
  buf.writeUInt32LE(0, ph + 8);        // p_vaddr
  buf.writeUInt32LE(0, ph + 12);       // p_paddr
  buf.writeUInt32LE(0x1000, ph + 16);  // p_filesz
  buf.writeUInt32LE(0x1000, ph + 20);  // p_memsz
  buf.writeUInt32LE(5, ph + 24);       // p_flags
  buf.writeUInt32LE(align, ph + 28);   // p_align ← the value we test

  return buf;
}

describe("parseElf", () => {
  test("returns null for empty buffer", () => {
    expect(parseElf(Buffer.alloc(0))).toBeNull();
  });

  test("returns null for non-ELF data", () => {
    expect(parseElf(Buffer.from("hello world"))).toBeNull();
  });

  test("returns null for too-short buffer", () => {
    expect(parseElf(Buffer.alloc(32, 0))).toBeNull();
  });

  test("64-bit: detects 16 KB aligned library as compliant", () => {
    const info = parseElf(make64bitElf(PAGE_16KB));
    expect(info).not.toBeNull();
    expect(info!.is64bit).toBe(true);
    expect(info!.minLoadAlignment).toBe(PAGE_16KB);
    expect(info!.minLoadAlignment).toBeGreaterThanOrEqual(PAGE_16KB);
  });

  test("64-bit: detects 4 KB aligned library as non-compliant", () => {
    const info = parseElf(make64bitElf(PAGE_4KB));
    expect(info).not.toBeNull();
    expect(info!.minLoadAlignment).toBe(PAGE_4KB);
    expect(info!.minLoadAlignment).toBeLessThan(PAGE_16KB);
  });

  test("32-bit: detects 16 KB aligned library as compliant", () => {
    const info = parseElf(make32bitElf(PAGE_16KB));
    expect(info).not.toBeNull();
    expect(info!.is64bit).toBe(false);
    expect(info!.minLoadAlignment).toBe(PAGE_16KB);
  });

  test("32-bit: detects 4 KB aligned library as non-compliant", () => {
    const info = parseElf(make32bitElf(PAGE_4KB));
    expect(info).not.toBeNull();
    expect(info!.minLoadAlignment).toBe(PAGE_4KB);
  });

  test("reports the minimum across multiple PT_LOAD segments", () => {
    // Build an ELF with two PT_LOAD segments: one at 16KB, one at 4KB
    const EHDR = 64;
    const PHDR = 56;
    const buf = Buffer.alloc(EHDR + PHDR * 2, 0);

    buf.writeUInt32BE(0x7f454c46, 0);
    buf[4] = 2; buf[5] = 1; buf[6] = 1;
    buf.writeUInt16LE(3, 16);
    buf.writeUInt16LE(183, 18);
    buf.writeUInt32LE(1, 20);
    buf.writeBigUInt64LE(BigInt(EHDR), 32);
    buf.writeUInt16LE(EHDR, 52);
    buf.writeUInt16LE(PHDR, 54);
    buf.writeUInt16LE(2, 56); // e_phnum = 2

    for (const [i, align] of [[0, PAGE_16KB], [1, PAGE_4KB]] as [number, number][]) {
      const ph = EHDR + i * PHDR;
      buf.writeUInt32LE(1, ph);           // PT_LOAD
      buf.writeUInt32LE(5, ph + 4);
      buf.writeBigUInt64LE(BigInt(align), ph + 48);
    }

    const info = parseElf(buf);
    expect(info).not.toBeNull();
    expect(info!.loadAlignments).toHaveLength(2);
    expect(info!.minLoadAlignment).toBe(PAGE_4KB); // minimum of [16KB, 4KB]
  });
});

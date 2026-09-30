#!/usr/bin/env python3
import struct
import sys
import os

def globalize_macho_file(file_path):
    with open(file_path, "rb") as f:
        data = bytearray(f.read())

    if len(data) < 32:
        return 0

    magic = struct.unpack_from("<I", data, 0)[0]
    if magic != 0xfeedfacf: # MH_MAGIC_64
        return 0

    ncmds = struct.unpack_from("<I", data, 16)[0]
    offset = 32
    symoff = None
    nsyms = None
    stroff = None
    strsize = None

    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from("<II", data, offset)
        if cmd == 0x2: # LC_SYMTAB
            symoff, nsyms, stroff, strsize = struct.unpack_from("<IIII", data, offset + 8)
            break
        offset += cmdsize

    if not symoff or not nsyms or not stroff:
        return 0

    strtab = data[stroff:stroff + strsize]
    count = 0

    # Target symbols to globalize (clear N_PEXT 0x10 and ensure N_EXT 0x01)
    target_prefixes = (
        "_log_stdout",
        "_on_webview_created",
        "_run_plugin_command",
        "_register_plugin",
        "_release_object",
        "_retain_object",
        "_string_from_bytes",
        "_data_from_bytes",
        "_post_notification"
    )

    for i in range(nsyms):
        entry_offset = symoff + i * 16
        n_strx, n_type = struct.unpack_from("<IB", data, entry_offset)
        if n_strx >= len(strtab):
            continue
        end = strtab.find(b"\x00", n_strx)
        if end == -1:
            continue
        name = strtab[n_strx:end].decode("utf-8", errors="ignore")

        if any(name == prefix or name.startswith(prefix) for prefix in target_prefixes):
            if n_type & 0x10: # If N_PEXT is set
                n_type = (n_type & ~0x10) | 0x01 # Clear N_PEXT, set N_EXT
                struct.pack_into("<B", data, entry_offset + 4, n_type)
                count += 1
                print(f"  [Globalized] {name} in {os.path.basename(file_path)}")

    if count > 0:
        with open(file_path, "wb") as f:
            f.write(data)

    return count

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: globalize-macho.py <file1.o> [file2.o ...]")
        sys.exit(1)
    for p in sys.argv[1:]:
        if os.path.isfile(p):
            globalize_macho_file(p)

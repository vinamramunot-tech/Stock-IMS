/**
 * Tauri & Capacitor Universal Global Bridge Shim for Mava Gems
 * Seamlessly bridges the Electron `window.electronAPI` interfaces to Tauri v2 and Capacitor context.
 */
(function() {
  window.isMobilePlatform = function() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  function getTauriCore() {
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return window.__TAURI__.core;
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return window.__TAURI_INTERNALS__;
    }
    return null;
  }

  async function safeInvoke(cmd, args, timeoutMs = 3500) {
    const core = getTauriCore();
    if (!core) {
      throw new Error("Tauri IPC bridge not ready");
    }
    return Promise.race([
      core.invoke(cmd, args),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout invoking " + cmd)), timeoutMs))
    ]);
  }

  function isCapacitor() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  }

  function getCapacitorPlugin(name) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) {
      return window.Capacitor.Plugins[name];
    }
    return null;
  }

  // ── Helper Utilities for Binary, AES-256-CBC Encryption & Gzip Processing ──

  const VAULT_SECRET = "mava-gems-luxury-jewelry-vault-security-key-2026";
  let cachedCryptoKey = null;

  async function getCryptoKey() {
    if (cachedCryptoKey) return cachedCryptoKey;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(VAULT_SECRET));
        cachedCryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
        return cachedCryptoKey;
      } catch (e) {
        console.warn("Crypto key derivation error:", e);
      }
    }
    return null;
  }

  async function decryptAesCbcBytes(bytes) {
    if (!bytes || bytes.length <= 16) return bytes;
    try {
      const key = await getCryptoKey();
      if (!key) return bytes;
      const iv = bytes.slice(0, 16);
      const ciphertext = bytes.slice(16);
      const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
      return new Uint8Array(decryptedBuf);
    } catch (e) {
      // If not encrypted or invalid key, return original bytes
      return bytes;
    }
  }

  async function encryptAesCbcBytes(bytes) {
    if (!bytes || bytes.length === 0) return bytes;
    try {
      const key = await getCryptoKey();
      if (!key) return bytes;
      const iv = crypto.getRandomValues(new Uint8Array(16));
      const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, bytes);
      const ciphertext = new Uint8Array(ciphertextBuf);
      const combined = new Uint8Array(16 + ciphertext.length);
      combined.set(iv, 0);
      combined.set(ciphertext, 16);
      return combined;
    } catch (e) {
      console.warn("Encryption failed:", e);
      return bytes;
    }
  }

  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000; // 32KB chunking to prevent stack overflow
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToUint8Array(base64Str) {
    let clean = (base64Str || '').trim();
    if (clean.includes(',')) clean = clean.split(',')[1];
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function decodeMsgPack(bytes) {
    if (!bytes || bytes.length === 0) return null;
    try {
      let offset = 0;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const textDecoder = new TextDecoder("utf-8");

      function read() {
        if (offset >= bytes.length) throw new Error("Unexpected end of MsgPack stream");
        const byte = bytes[offset++];
        if (byte <= 0x7f) return byte;
        if (byte >= 0x80 && byte <= 0x8f) return readMap(byte & 0x0f);
        if (byte >= 0x90 && byte <= 0x9f) return readArray(byte & 0x0f);
        if (byte >= 0xa0 && byte <= 0xbf) return readString(byte & 0x1f);
        if (byte === 0xc0) return null;
        if (byte === 0xc2) return false;
        if (byte === 0xc3) return true;
        if (byte === 0xc4) return readBinary(view.getUint8(offset++));
        if (byte === 0xc5) { const len = view.getUint16(offset); offset += 2; return readBinary(len); }
        if (byte === 0xc6) { const len = view.getUint32(offset); offset += 4; return readBinary(len); }
        if (byte === 0xca) { const val = view.getFloat32(offset); offset += 4; return val; }
        if (byte === 0xcb) { const val = view.getFloat64(offset); offset += 8; return val; }
        if (byte === 0xcc) return view.getUint8(offset++);
        if (byte === 0xcd) { const val = view.getUint16(offset); offset += 2; return val; }
        if (byte === 0xce) { const val = view.getUint32(offset); offset += 4; return val; }
        if (byte === 0xcf) {
          const hi = view.getUint32(offset);
          const lo = view.getUint32(offset + 4);
          offset += 8;
          return hi * 4294967296 + lo;
        }
        if (byte === 0xd0) return view.getInt8(offset++);
        if (byte === 0xd1) { const val = view.getInt16(offset); offset += 2; return val; }
        if (byte === 0xd2) { const val = view.getInt32(offset); offset += 4; return val; }
        if (byte === 0xd3) {
          const hi = view.getInt32(offset);
          const lo = view.getUint32(offset + 4);
          offset += 8;
          return hi * 4294967296 + lo;
        }
        if (byte === 0xd9) { const len = view.getUint8(offset++); return readString(len); }
        if (byte === 0xda) { const len = view.getUint16(offset); offset += 2; return readString(len); }
        if (byte === 0xdb) { const len = view.getUint32(offset); offset += 4; return readString(len); }
        if (byte === 0xdc) { const len = view.getUint16(offset); offset += 2; return readArray(len); }
        if (byte === 0xdd) { const len = view.getUint32(offset); offset += 4; return readArray(len); }
        if (byte === 0xde) { const len = view.getUint16(offset); offset += 2; return readMap(len); }
        if (byte === 0xdf) { const len = view.getUint32(offset); offset += 4; return readMap(len); }
        if (byte >= 0xe0) return byte - 0x100;
        throw new Error("Unsupported MsgPack byte: 0x" + byte.toString(16));
      }
      function readString(len) {
        const sub = bytes.subarray(offset, offset + len);
        offset += len;
        return textDecoder.decode(sub);
      }
      function readBinary(len) {
        const sub = bytes.subarray(offset, offset + len);
        offset += len;
        return sub;
      }
      function readArray(len) {
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = read();
        return arr;
      }
      function readMap(len) {
        const obj = {};
        for (let i = 0; i < len; i++) {
          const key = read();
          const val = read();
          obj[key] = val;
        }
        return obj;
      }
      return read();
    } catch (e) {
      return null;
    }
  }

  async function decompressGzipRawBytes(uint8Array) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(uint8Array);
        writer.close();
        const output = [];
        const reader = ds.readable.getReader();
        let totalSize = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          output.push(value);
          totalSize += value.byteLength;
        }
        const concatenated = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of output) {
          concatenated.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return concatenated;
      } catch (streamErr) {
        console.warn("DecompressionStream error:", streamErr);
      }
    }
    return uint8Array;
  }

  async function decompressGzipBytes(uint8Array) {
    const raw = await decompressGzipRawBytes(uint8Array);
    return new TextDecoder('utf-8').decode(raw);
  }

  async function compressGzipString(utf8String) {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(new TextEncoder().encode(utf8String));
        writer.close();
        const output = [];
        const reader = cs.readable.getReader();
        let totalSize = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          output.push(value);
          totalSize += value.byteLength;
        }
        const concatenated = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of output) {
          concatenated.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return concatenated;
      } catch (streamErr) {
        console.warn("CompressionStream error:", streamErr);
      }
    }
    return new TextEncoder().encode(utf8String);
  }

  async function parseVaultPayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw) && !(raw instanceof Uint8Array) && !(raw instanceof ArrayBuffer)) {
      return JSON.stringify(raw);
    }

    let bytes = null;
    if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else if (raw instanceof Uint8Array) {
      bytes = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
      }
      try {
        bytes = base64ToUint8Array(trimmed);
      } catch (e) {
        return trimmed;
      }
    }

    if (bytes && bytes.length > 0) {
      // 1. Direct UTF-8 JSON check
      try {
        const directText = new TextDecoder('utf-8').decode(bytes).trim();
        if (directText.startsWith('{') && directText.endsWith('}')) {
          return directText;
        }
      } catch (_) {}

      // 2. Decrypt with AES-256-CBC (standard desktop vault format)
      let payloadBytes = await decryptAesCbcBytes(bytes);

      // 3. Decompress Gzip if magic bytes present [0x1f, 0x8b]
      if (payloadBytes.length >= 2 && payloadBytes[0] === 0x1f && payloadBytes[1] === 0x8b) {
        const decompressedRaw = await decompressGzipRawBytes(payloadBytes);
        try {
          const text = new TextDecoder('utf-8').decode(decompressedRaw).trim();
          if (text.startsWith('{') && text.endsWith('}')) {
            return text;
          }
        } catch (_) {}

        // Try MsgPack inside decompressed Gzip
        const msgpackObj = decodeMsgPack(decompressedRaw);
        if (msgpackObj && typeof msgpackObj === 'object') {
          return JSON.stringify(msgpackObj);
        }
      }

      // 4. Try UTF-8 on decrypted payload bytes
      try {
        const text = new TextDecoder('utf-8').decode(payloadBytes).trim();
        if (text.startsWith('{') && text.endsWith('}')) {
          return text;
        }
      } catch (_) {}

      // 5. Try MsgPack on decrypted payload bytes
      const decryptedMsgpack = decodeMsgPack(payloadBytes);
      if (decryptedMsgpack && typeof decryptedMsgpack === 'object') {
        return JSON.stringify(decryptedMsgpack);
      }

      // 6. Fallback for unencrypted Gzip bytes
      if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const decompressedRaw = await decompressGzipRawBytes(bytes);
        try {
          const text = new TextDecoder('utf-8').decode(decompressedRaw).trim();
          if (text.startsWith('{') && text.endsWith('}')) {
            return text;
          }
        } catch (_) {}

        const msgpackObj = decodeMsgPack(decompressedRaw);
        if (msgpackObj && typeof msgpackObj === 'object') {
          return JSON.stringify(msgpackObj);
        }
      }

      // 7. Try MsgPack on raw unencrypted bytes
      const rawMsgpack = decodeMsgPack(bytes);
      if (rawMsgpack && typeof rawMsgpack === 'object') {
        return JSON.stringify(rawMsgpack);
      }
    }

    return typeof raw === 'string' ? raw : null;
  }

  async function encodeVaultPayload(jsonString) {
    // 1. Gzip compression
    const gzipped = await compressGzipString(jsonString);
    // 2. AES-256-CBC encryption with 16-byte random IV
    const encrypted = await encryptAesCbcBytes(gzipped);
    // 3. Return base64 string
    return uint8ArrayToBase64(encrypted);
  }

  console.log("💎 Initializing universal translation bridge for Mava Gems (Tauri & Capacitor dual-mode)...");

  // Helper to handle native file picking from iOS Files / OneDrive / document picker
  async function pickAndImportMobileFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ".db,.json,application/octet-stream,text/plain,*/*";
      let resolved = false;

      input.onchange = async (e) => {
        if (resolved) return;
        const file = e.target.files && e.target.files[0];
        if (!file) {
          resolved = true;
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const arrayBuffer = evt.target.result;
            const jsonString = await parseVaultPayload(arrayBuffer);
            if (!jsonString) {
              throw new Error("Unable to parse database file. Format must be a valid .db or .json file.");
            }

            // Validate that it parses as JSON object
            const parsed = JSON.parse(jsonString);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              throw new Error("Invalid database schema in selected file.");
            }

            const targetName = file.name || 'mava_gems_stock.db';

            // 1. Save to Capacitor native Filesystem Documents folder
            const fs = getCapacitorPlugin('Filesystem');
            if (fs) {
              try {
                const base64Data = await encodeVaultPayload(jsonString);
                await fs.writeFile({
                  path: targetName,
                  data: base64Data,
                  directory: 'DOCUMENTS',
                  recursive: true
                });
              } catch (fsErr) {
                console.warn("Failed to write to Capacitor Filesystem:", fsErr.message);
              }
            }

            // 2. Also save to local storage cache for instant offline access
            try {
              localStorage.setItem("mock_db_" + targetName, jsonString);
              localStorage.setItem("lastActiveDbPath", targetName);
            } catch (lsErr) {
              console.warn("localStorage note:", lsErr);
            }

            // 3. If Desktop Tauri is available, import via IPC too
            const core = getTauriCore();
            if (core) {
              try {
                const base64Data = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
                await safeInvoke('import_db_file', {
                  base64_data: base64Data,
                  base64Data,
                  custom_path: targetName,
                  customPath: targetName
                }, 10000);
              } catch (coreErr) {
                console.warn("Tauri import_db_file fallback:", coreErr);
              }
            }

            resolved = true;
            resolve(targetName);
          } catch (err) {
            alert("Failed to load database file: " + err.message);
            resolved = true;
            resolve(null);
          }
        };
        reader.readAsArrayBuffer(file);
      };

      input.oncancel = () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      };

      input.click();
    });
  }

  window.electronAPI = {
    // Basic configuration getters/setters
    getLastDbPath: async () => {
      try {
        const core = getTauriCore();
        if (core) {
          const res = await safeInvoke('get_last_db_path', {}, 2500);
          if (res) return res;
        }
      } catch (e) {
        console.warn("getLastDbPath IPC fallback:", e.message);
      }
      return localStorage.getItem('lastActiveDbPath') || '';
    },

    setLastDbPath: async (dbPath) => {
      try {
        if (dbPath) {
          localStorage.setItem('lastActiveDbPath', dbPath);
        } else {
          localStorage.removeItem('lastActiveDbPath');
        }
        const core = getTauriCore();
        if (core) {
          return await safeInvoke('set_last_db_path', { db_path: dbPath, dbPath }, 2500);
        }
      } catch (e) {
        console.warn("setLastDbPath IPC fallback:", e.message);
      }
      return true;
    },

    // Native file/folder picker dialogs
    createDbDialog: async () => {
      const core = getTauriCore();
      if (core && !window.isMobilePlatform()) {
        try {
          return await safeInvoke('create_db_dialog', {}, 10000);
        } catch (e) {
          console.warn("createDbDialog failed:", e);
        }
      }
      return "mava_gems_stock.db";
    },
    
    openDbDialog: async () => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        return await pickAndImportMobileFile();
      } else {
        const core = getTauriCore();
        if (core) {
          try {
            return await safeInvoke('open_db_dialog', {}, 10000);
          } catch (e) {
            console.warn("openDbDialog failed:", e);
          }
        }
        return prompt("Enter path of database to open:", "mava_gems_stock.db");
      }
    },

    selectDirectory: async () => {
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('select_directory', {}, 10000);
        } catch (e) {
          console.warn("selectDirectory failed:", e);
        }
      }
      return "/mock/directory";
    },

    exportBackupDialog: async (defaultName) => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        return "MOBILE_SHARE_PATH:" + (defaultName || "mava_gems_stock_backup.db");
      }
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('export_backup_dialog', { _default_name: defaultName, default_name: defaultName, defaultName }, 10000);
        } catch (e) {
          console.warn("exportBackupDialog failed:", e);
        }
      }
      return defaultName || "mava_gems_stock_backup.db";
    },
    
    importBackupDialog: async () => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        return await pickAndImportMobileFile();
      } else {
        const core = getTauriCore();
        if (core) {
          try {
            return await safeInvoke('import_backup_dialog', {}, 10000);
          } catch (e) {
            console.warn("importBackupDialog failed:", e);
          }
        }
        return "mava_gems_stock_backup.db";
      }
    },

    // Mobile-only: pick a .db file from the document picker
    mobilePickAndLoadDb: async () => {
      return await pickAndImportMobileFile();
    },

    // Database reads and writes
    readVault: async (customPath) => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      const fileName = (customPath || 'mava_gems_stock.db').split('/').pop() || 'mava_gems_stock.db';

      // 1. Capacitor Native Filesystem (iOS)
      const fs = getCapacitorPlugin('Filesystem');
      if (fs) {
        try {
          const res = await fs.readFile({
            path: fileName,
            directory: 'DOCUMENTS'
          });
          if (res && res.data) {
            const jsonStr = await parseVaultPayload(res.data);
            if (jsonStr) {
              return { exists: true, data: jsonStr, path: fileName };
            }
          }
        } catch (capErr) {
          console.log("Capacitor readFile note:", capErr.message);
        }
      }

      // 2. Desktop Tauri IPC (macOS / Windows)
      const core = getTauriCore();
      if (core) {
        try {
          const res = await safeInvoke('read_vault', { custom_path: customPath, customPath }, 6000);
          if (res && res.exists) {
            return res;
          }
        } catch (e) {
          console.warn("readVault IPC failed, checking storage fallback:", e.message);
        }
      }

      // 3. LocalStorage fallback
      const key = "mock_db_" + fileName;
      const data = localStorage.getItem(key) || localStorage.getItem("mock_db_" + customPath);
      if (data) {
        const jsonStr = await parseVaultPayload(data);
        if (jsonStr) {
          return { exists: true, data: jsonStr, path: fileName };
        }
      }

      return { exists: false, data: null };
    },

    writeVault: async (payload, customPath) => {
      const fileName = (customPath || 'mava_gems_stock.db').split('/').pop() || 'mava_gems_stock.db';
      const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

      // Always update localStorage cache
      try {
        localStorage.setItem("mock_db_" + fileName, content);
      } catch (lsErr) {
        console.warn("localStorage quota:", lsErr);
      }

      // 1. Capacitor Native Filesystem (iOS Documents directory)
      const fs = getCapacitorPlugin('Filesystem');
      if (fs) {
        try {
          const base64Data = await encodeVaultPayload(content);
          await fs.writeFile({
            path: fileName,
            data: base64Data,
            directory: 'DOCUMENTS',
            recursive: true
          });
          return { success: true, path: fileName };
        } catch (capErr) {
          console.warn("Capacitor writeFile failed:", capErr.message);
        }
      }

      // 2. Desktop Tauri IPC (macOS / Windows)
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('write_vault', { payload: content, custom_path: customPath, customPath }, 6000);
        } catch (e) {
          console.warn("writeVault IPC failed:", e.message);
        }
      }

      return { success: true, path: customPath };
    },

    // Local utility functions
    copyFile: async (sourcePath, destPath) => {
      if (destPath && destPath.startsWith("MOBILE_SHARE_PATH:")) {
        const filename = destPath.substring("MOBILE_SHARE_PATH:".length);
        try {
          const fileInfo = await window.electronAPI.readVault(sourcePath);
          if (fileInfo && fileInfo.data) {
            const str = typeof fileInfo.data === 'string' ? fileInfo.data : JSON.stringify(fileInfo.data);
            const base64Data = await encodeVaultPayload(str);
            return await window.electronAPI.savePdfFile(base64Data, destPath);
          }
        } catch (e) {
          console.warn("Mobile share backup fallback:", e);
        }
      }
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('copy_file', { source_path: sourcePath, sourcePath, dest_path: destPath, destPath }, 5000);
        } catch (e) {
          console.warn("copyFile IPC failed:", e);
        }
      }
      const data = localStorage.getItem("mock_db_" + sourcePath);
      if (data) {
        localStorage.setItem("mock_db_" + destPath, data);
      }
      return true;
    },
    
    // PDF / Image saving dialog and file writing
    saveFileDialog: async (defaultName) => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        return "MOBILE_SHARE_PATH:" + defaultName;
      } else {
        const core = getTauriCore();
        if (core) {
          try {
            return await safeInvoke('save_file_dialog', { default_name: defaultName, defaultName }, 10000);
          } catch (e) {
            console.warn("saveFileDialog failed:", e);
          }
        }
        return defaultName;
      }
    },

    savePdfFile: async (base64Data, path) => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        const rawFilename = (path && path.startsWith("MOBILE_SHARE_PATH:"))
          ? path.substring("MOBILE_SHARE_PATH:".length)
          : (path || 'report.pdf');
        const filename = rawFilename.split('/').pop() || 'report.pdf';
        let cleanBase64 = base64Data || '';
        if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1];

        // 1. Capacitor Native Filesystem + Share Sheet
        const fs = getCapacitorPlugin('Filesystem');
        const share = getCapacitorPlugin('Share');
        if (fs && share) {
          try {
            const writeRes = await fs.writeFile({
              path: filename,
              data: cleanBase64,
              directory: 'CACHE',
              recursive: true
            });
            if (writeRes && writeRes.uri) {
              await share.share({
                title: filename,
                url: writeRes.uri,
                dialogTitle: 'Share ' + filename
              });
              return true;
            }
          } catch (capShareErr) {
            console.warn("Capacitor share failed, trying Web Share fallback:", capShareErr);
          }
        }

        // 2. Web Share API fallback
        try {
          const byteCharacters = atob(cleanBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          let mimeType = 'application/pdf';
          if (filename.toLowerCase().endsWith('.png')) mimeType = 'image/png';
          else if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
          else if (filename.toLowerCase().endsWith('.db') || filename.toLowerCase().endsWith('.json')) mimeType = 'application/octet-stream';

          const blob = new Blob([byteArray], { type: mimeType });
          if (navigator.canShare && navigator.share) {
            const file = new File([blob], filename, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: filename, text: 'Exported from Mava Gems' });
              return true;
            }
          }

          // 3. Fallback: Blob download link
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          return true;
        } catch (e) {
          if (e.name === 'AbortError') return true;
          console.error("Mobile share/save PDF failed:", e);
          if (window.UI) UI.showToast("Failed to share file: " + e.message, true);
          return false;
        }
      } else {
        const core = getTauriCore();
        if (core) {
          return await safeInvoke('save_pdf_file', { base64_data: base64Data, base64Data, path }, 10000);
        }
        return true;
      }
    },

    // Excel (.xlsx) file saver
    saveXlsxFile: async (base64Data, path) => {
      const isMobile = window.isMobilePlatform() || isCapacitor();
      if (isMobile) {
        const rawFilename = (path && path.startsWith("MOBILE_SHARE_PATH:"))
          ? path.substring("MOBILE_SHARE_PATH:".length)
          : (path || 'report.xlsx');
        const filename = rawFilename.split('/').pop() || 'report.xlsx';
        let cleanBase64 = base64Data || '';
        if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1];

        // 1. Capacitor Native Filesystem + Share Sheet
        const fs = getCapacitorPlugin('Filesystem');
        const share = getCapacitorPlugin('Share');
        if (fs && share) {
          try {
            const writeRes = await fs.writeFile({
              path: filename,
              data: cleanBase64,
              directory: 'CACHE',
              recursive: true
            });
            if (writeRes && writeRes.uri) {
              await share.share({
                title: filename,
                url: writeRes.uri,
                dialogTitle: 'Share ' + filename
              });
              return true;
            }
          } catch (capShareErr) {
            console.warn("Capacitor share failed, trying Web Share fallback:", capShareErr);
          }
        }

        // 2. Web Share API fallback
        try {
          const byteCharacters = atob(cleanBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const blob = new Blob([byteArray], { type: mimeType });
          if (navigator.canShare && navigator.share) {
            const file = new File([blob], filename, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: filename, text: 'Exported from Mava Gems' });
              return true;
            }
          }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          return true;
        } catch (e) {
          if (e.name === 'AbortError') return true;
          console.error("Mobile share/save XLSX failed:", e);
          if (window.UI) UI.showToast("Failed to save Excel file: " + e.message, true);
          return false;
        }
      } else {
        const core = getTauriCore();
        if (core) {
          return await safeInvoke('save_pdf_file', { base64_data: base64Data, base64Data, path }, 10000);
        }
        return true;
      }
    },

    // Real-time Database File Change Hook (Tauri Events)
    onDatabaseChanged: (callback) => {
      try {
        if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
          window.__TAURI__.event.listen('database-file-changed', (event) => {
            console.log("📝 Database changed externally, reloading:", event.payload);
            callback(event.payload);
          });
        }
      } catch (e) {
        console.warn("Event listener not registered:", e);
      }
    }
  };
})();

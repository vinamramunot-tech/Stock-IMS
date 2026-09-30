/**
 * Tauri Global Bridge Shim for Mava Gems
 * Seamlessly bridges the Electron `window.electronAPI` interfaces to Tauri v2's `window.__TAURI__` context.
 * Exposing this shim prevents modifying any core database driver or UI rendering code.
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

  console.log("💎 Initializing universal translation bridge for Mava Gems...");

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
      const isMobile = window.isMobilePlatform();
      if (isMobile) {
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = ".db,.json,application/octet-stream,text/plain";
          let resolved = false;

          const onFocus = () => {
            window.removeEventListener('focus', onFocus);
            setTimeout(() => {
              if (!resolved && (!input.files || input.files.length === 0)) {
                resolved = true;
                resolve(null);
              }
            }, 600);
          };
          window.addEventListener('focus', onFocus);

          input.onchange = async (e) => {
            window.removeEventListener('focus', onFocus);
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
                const dataUrl = evt.target.result;
                const base64Data = dataUrl.split(',')[1];
                let targetPath = file.name || (window.DBManager && window.DBManager.activePath) || 'mava_gems_stock.db';
                const core = getTauriCore();
                if (core) {
                  await safeInvoke('import_db_file', { base64_data: base64Data, base64Data, custom_path: targetPath, customPath: targetPath }, 10000);
                }
                resolved = true;
                resolve(targetPath);
              } catch (err) {
                alert("Failed to import database file: " + err.message);
                resolved = true;
                resolve(null);
              }
            };
            reader.readAsDataURL(file);
          };
          input.click();
        });
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
      const isMobile = window.isMobilePlatform();
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
      const isMobile = window.isMobilePlatform();
      if (isMobile) {
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = ".db,.json,application/octet-stream,text/plain";
          let resolved = false;

          const onFocus = () => {
            window.removeEventListener('focus', onFocus);
            setTimeout(() => {
              if (!resolved && (!input.files || input.files.length === 0)) {
                resolved = true;
                resolve(null);
              }
            }, 600);
          };
          window.addEventListener('focus', onFocus);

          input.onchange = async (e) => {
            window.removeEventListener('focus', onFocus);
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
                const dataUrl = evt.target.result;
                const base64Data = dataUrl.split(',')[1];
                const targetPath = file.name || (window.DBManager && window.DBManager.activePath) || 'mava_gems_stock.db';
                const core = getTauriCore();
                if (core) {
                  await safeInvoke('import_db_file', { base64_data: base64Data, base64Data, custom_path: targetPath, customPath: targetPath }, 10000);
                }
                resolved = true;
                resolve(targetPath);
              } catch (err) {
                alert("Failed to import backup file: " + err.message);
                resolved = true;
                resolve(null);
              }
            };
            reader.readAsDataURL(file);
          };
          input.click();
        });
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
    mobilePickAndLoadDb: () => new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ".db,.json,application/octet-stream,text/plain";
      let resolved = false;

      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!resolved && (!input.files || input.files.length === 0)) {
            resolved = true;
            resolve(null);
          }
        }, 600);
      };
      window.addEventListener('focus', onFocus);

      input.onchange = async (e) => {
        window.removeEventListener('focus', onFocus);
        if (resolved) return;
        const file = e.target.files && e.target.files[0];
        if (!file) { resolved = true; resolve(null); return; }
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const dataUrl = evt.target.result;
            const base64Data = dataUrl.split(',')[1];
            let targetPath = file.name || (window.DBManager && window.DBManager.activePath) || 'mava_gems_stock.db';
            const core = getTauriCore();
            if (core) {
              await safeInvoke('import_db_file', { base64_data: base64Data, base64Data, custom_path: targetPath, customPath: targetPath }, 10000);
            }
            resolved = true;
            resolve(targetPath);
          } catch (err) {
            alert('Failed to read database file: ' + err.message);
            resolved = true;
            resolve(null);
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }),

    // Database reads and writes (AES-256-CBC)
    readVault: async (customPath) => {
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('read_vault', { custom_path: customPath, customPath }, 5000);
        } catch (e) {
          console.warn("readVault IPC failed, checking storage fallback:", e.message);
        }
      }
      const key = "mock_db_" + (customPath || 'default');
      const data = localStorage.getItem(key);
      if (data) {
        return { exists: true, data, path: customPath };
      }
      return { exists: false, data: null };
    },

    writeVault: async (payload, customPath) => {
      const core = getTauriCore();
      if (core) {
        try {
          return await safeInvoke('write_vault', { payload, custom_path: customPath, customPath }, 6000);
        } catch (e) {
          console.warn("writeVault IPC failed:", e.message);
        }
      }
      const key = "mock_db_" + (customPath || 'default');
      try {
        localStorage.setItem(key, payload);
      } catch (lsErr) {
        console.warn("localStorage quota:", lsErr);
      }
      return { success: true, path: customPath };
    },

    // Local utility functions
    copyFile: async (sourcePath, destPath) => {
      if (destPath && destPath.startsWith("MOBILE_SHARE_PATH:")) {
        const filename = destPath.substring("MOBILE_SHARE_PATH:".length);
        try {
          const core = getTauriCore();
          let base64Data = null;
          if (core) {
            const fileInfo = await safeInvoke('read_vault', { custom_path: sourcePath, customPath: sourcePath }, 5000);
            if (fileInfo && fileInfo.data) {
              const str = typeof fileInfo.data === 'string' ? fileInfo.data : JSON.stringify(fileInfo.data);
              base64Data = btoa(unescape(encodeURIComponent(str)));
            }
          }
          if (base64Data) {
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
      const isMobile = window.isMobilePlatform();
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
      if (path && path.startsWith("MOBILE_SHARE_PATH:")) {
        const filename = path.substring("MOBILE_SHARE_PATH:".length);
        try {
          let cleanBase64 = base64Data || '';
          if (cleanBase64.includes(',')) {
            cleanBase64 = cleanBase64.split(',')[1];
          }
          const byteCharacters = atob(cleanBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          let mimeType = 'application/pdf';
          if (filename.toLowerCase().endsWith('.png')) {
            mimeType = 'image/png';
          } else if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
          } else if (filename.toLowerCase().endsWith('.db') || filename.toLowerCase().endsWith('.json')) {
            mimeType = 'application/octet-stream';
          }
          const blob = new Blob([byteArray], { type: mimeType });
          
          if (navigator.canShare && navigator.share) {
            const file = new File([blob], filename, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: filename,
                text: 'Exported from Mava Gems'
              });
              return true;
            }
          }
          
          // Fallback: blob download
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
          if (e.name === 'AbortError') {
            return true; // User tapped cancel or closed iOS share sheet
          }
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
      if (path && path.startsWith("MOBILE_SHARE_PATH:")) {
        const filename = path.substring("MOBILE_SHARE_PATH:".length);
        try {
          let cleanBase64 = base64Data || '';
          if (cleanBase64.includes(',')) {
            cleanBase64 = cleanBase64.split(',')[1];
          }
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
          if (e.name === 'AbortError') {
            return true; // User tapped cancel or closed iOS share sheet
          }
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

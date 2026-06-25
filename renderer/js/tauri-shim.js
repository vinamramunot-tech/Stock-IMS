/**
 * Tauri Global Bridge Shim for Mava Gems
 * Seamlessly bridges the Electron `window.electronAPI` interfaces to Tauri v2's `window.__TAURI__` context.
 * Exposing this shim prevents modifying any core database driver or UI rendering code.
 */
(function() {
  if (window.__TAURI__) {
    console.log("💎 Tauri environment detected. Initializing global translation bridge...");

    window.electronAPI = {
      // Basic configuration getters/setters
      getLastDbPath: () => window.__TAURI__.core.invoke('get_last_db_path'),
      setLastDbPath: (dbPath) => window.__TAURI__.core.invoke('set_last_db_path', { dbPath }),

      // Native file/folder picker dialogs
      createDbDialog: () => window.__TAURI__.core.invoke('create_db_dialog'),
      
      openDbDialog: async () => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
              const file = e.target.files[0];
              if (!file) {
                resolve(null);
                return;
              }
              const reader = new FileReader();
              reader.onload = async (evt) => {
                try {
                  const dataUrl = evt.target.result;
                  const base64Data = dataUrl.split(',')[1];
                  let targetPath = DBManager.activePath;
                  if (!targetPath) {
                    targetPath = await window.electronAPI.getLastDbPath();
                  }
                  if (!targetPath) {
                    targetPath = 'mava_gems_stock.db';
                  }
                  await window.__TAURI__.core.invoke('import_db_file', { base64Data, customPath: targetPath });
                  resolve(targetPath);
                } catch (err) {
                  alert("Failed to import database file: " + err.message);
                  resolve(null);
                }
              };
              reader.readAsDataURL(file);
            };
            input.click();
          });
        } else {
          return window.__TAURI__.core.invoke('open_db_dialog');
        }
      },

      selectDirectory: () => window.__TAURI__.core.invoke('select_directory'),
      exportBackupDialog: (defaultName) => window.__TAURI__.core.invoke('export_backup_dialog', { defaultName }),
      
      importBackupDialog: async () => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
              const file = e.target.files[0];
              if (!file) {
                resolve(null);
                return;
              }
              const reader = new FileReader();
              reader.onload = async (evt) => {
                try {
                  const dataUrl = evt.target.result;
                  const base64Data = dataUrl.split(',')[1];
                  const targetPath = DBManager.activePath || 'mava_gems_stock.db';
                  await window.__TAURI__.core.invoke('import_db_file', { base64Data, customPath: targetPath });
                  resolve(targetPath);
                } catch (err) {
                  alert("Failed to import backup file: " + err.message);
                  resolve(null);
                }
              };
              reader.readAsDataURL(file);
            };
            input.click();
          });
        } else {
          return window.__TAURI__.core.invoke('import_backup_dialog');
        }
      },

      // Mobile-only: pick a .db file from the document picker, write it to a
      // known fixed path (so activePath is never null), and return that path.
      mobilePickAndLoadDb: () => new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = async (evt) => {
            try {
              const dataUrl = evt.target.result;
              const base64Data = dataUrl.split(',')[1];
              let targetPath = await window.electronAPI.getLastDbPath();
              if (!targetPath) {
                targetPath = 'mava_gems_stock.db';
              }
              await window.__TAURI__.core.invoke('import_db_file', { base64Data, customPath: targetPath });
              resolve(targetPath);
            } catch (err) {
              alert('Failed to read database file: ' + err.message);
              resolve(null);
            }
          };
          reader.readAsDataURL(file);
        };
        input.click();
      }),

      // Database reads and writes (AES-256-CBC)
      readVault: (customPath) => window.__TAURI__.core.invoke('read_vault', { customPath }),
      writeVault: (payload, customPath) => window.__TAURI__.core.invoke('write_vault', { payload, customPath }),

      // Local utility functions
      copyFile: (sourcePath, destPath) => window.__TAURI__.core.invoke('copy_file', { sourcePath, destPath }),
      
      // PDF saving dialog and file writing
      saveFileDialog: async (defaultName) => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          return "MOBILE_SHARE_PATH:" + defaultName;
        } else {
          return window.__TAURI__.core.invoke('save_file_dialog', { defaultName });
        }
      },
      savePdfFile: async (base64Data, path) => {
        if (path && path.startsWith("MOBILE_SHARE_PATH:")) {
          const filename = path.substring("MOBILE_SHARE_PATH:".length);
          try {
            const byteCharacters = atob(base64Data);
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
            console.error("Mobile share/save PDF failed:", e);
            alert("Failed to share PDF: " + e.message);
            return false;
          }
        } else {
          return window.__TAURI__.core.invoke('save_pdf_file', { base64Data: base64Data, path });
        }
      },

      // Excel (.xlsx) file saver — reuses the same Tauri command as PDF (generic base64 writer)
      saveXlsxFile: async (base64Data, path) => {
        if (path && path.startsWith("MOBILE_SHARE_PATH:")) {
          const filename = path.substring("MOBILE_SHARE_PATH:".length);
          try {
            const byteCharacters = atob(base64Data);
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
            console.error("Mobile share/save XLSX failed:", e);
            alert("Failed to save Excel file: " + e.message);
            return false;
          }
        } else {
          // Reuse the generic base64-to-file Tauri command
          return window.__TAURI__.core.invoke('save_pdf_file', { base64Data: base64Data, path });
        }
      },

      // Real-time Database File Change Hook (Tauri Events)
      onDatabaseChanged: (callback) => {
        window.__TAURI__.event.listen('database-file-changed', (event) => {
          console.log("📝 Database changed externally, reloading:", event.payload);
          callback(event.payload);
        });
      }
    };
  } else {
    console.log("⚡ Electron environment or dev-browser detected. Initializing browser mock translation bridge...");
    window.electronAPI = {
      getLastDbPath: async () => {
        return localStorage.getItem('lastActiveDbPath') || '';
      },
      setLastDbPath: async (dbPath) => {
        if (dbPath) {
          localStorage.setItem('lastActiveDbPath', dbPath);
        } else {
          localStorage.removeItem('lastActiveDbPath');
        }
        return true;
      },
      createDbDialog: async () => {
        return prompt("Enter path for new database:", "mava_gems_stock.db");
      },
      openDbDialog: async () => {
        return prompt("Enter path of database to open:", "mava_gems_stock.db");
      },
      selectDirectory: async () => {
        return "/mock/directory";
      },
      exportBackupDialog: async (defaultName) => {
        return defaultName || "mava_gems_stock_backup.db";
      },
      importBackupDialog: async () => {
        return "mava_gems_stock_backup.db";
      },
      readVault: async (customPath) => {
        const key = "mock_db_" + customPath;
        let data = localStorage.getItem(key);
        if (!data) {
          data = JSON.stringify({
            settings: {
              currency: "₹",
              goldRate24kt: {
                ratePerGram: 0,
                effectiveDate: new Date().toISOString().split('T')[0],
                updatedAt: new Date().toISOString()
              }
            },
            items: [],
            logs: []
          });
          localStorage.setItem(key, data);
        }
        return { exists: true, data, path: customPath };
      },
      writeVault: async (payload, customPath) => {
        localStorage.setItem("mock_db_" + customPath, payload);
        return { success: true, path: customPath };
      },
      copyFile: async (sourcePath, destPath) => {
        const data = localStorage.getItem("mock_db_" + sourcePath);
        if (data) {
          localStorage.setItem("mock_db_" + destPath, data);
        }
        return true;
      },
      saveFileDialog: async (defaultName) => {
        return prompt("Save PDF to path:", defaultName);
      },
      savePdfFile: async (base64Data, path) => {
        console.log(`Mock: Saved PDF file to ${path}`);
        return true;
      },
      saveXlsxFile: async (base64Data, path) => {
        console.log(`Mock: Saved XLSX file to ${path}`);
        return true;
      },
      onDatabaseChanged: (callback) => {
        console.log("📝 Mock database changed watcher registered.");
      }
    };
  }
})();

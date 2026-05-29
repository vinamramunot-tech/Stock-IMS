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
      openDbDialog: () => window.__TAURI__.core.invoke('open_db_dialog'),
      selectDirectory: () => window.__TAURI__.core.invoke('select_directory'),
      exportBackupDialog: (defaultName) => window.__TAURI__.core.invoke('export_backup_dialog', { defaultName }),
      importBackupDialog: () => window.__TAURI__.core.invoke('import_backup_dialog'),

      // Database reads and writes (AES-256-CBC)
      readVault: (customPath) => window.__TAURI__.core.invoke('read_vault', { customPath }),
      writeVault: (payload, customPath) => window.__TAURI__.core.invoke('write_vault', { payload, customPath }),

      // Local utility functions
      copyFile: (sourcePath, destPath) => window.__TAURI__.core.invoke('copy_file', { sourcePath, destPath }),

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
      onDatabaseChanged: (callback) => {
        console.log("📝 Mock database changed watcher registered.");
      }
    };
  }
})();

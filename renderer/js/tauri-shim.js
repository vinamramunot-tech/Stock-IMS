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
    console.log("⚡ Electron environment or dev-browser detected. Skipping Tauri translation bridge...");
  }
})();

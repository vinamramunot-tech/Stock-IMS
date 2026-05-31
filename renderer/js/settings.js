/**
 * Settings Module
 * Manages database exports, imports, erasing, clearing logs, and global rate updates.
 */

const Settings = {
  init() {
    // Settings actions listeners
    document.getElementById('btn-disconnect-vault').addEventListener('click', () => this.handleDisconnectVault());
    document.getElementById('btn-export-backup').addEventListener('click', () => this.handleExportBackup());
    document.getElementById('btn-import-backup').addEventListener('click', () => this.handleImportBackup());
    
    document.getElementById('btn-erase-vault').addEventListener('click', () => {
      document.getElementById('erase-confirm-input').value = '';
      document.getElementById('btn-erase-vault-confirm').disabled = true;
      UI.openModal('modal-erase-confirm');
    });
    
    document.getElementById('erase-confirm-input').addEventListener('input', (e) => {
      const confirmBtn = document.getElementById('btn-erase-vault-confirm');
      confirmBtn.disabled = e.target.value !== 'ERASE';
    });
    
    document.getElementById('btn-erase-vault-confirm').addEventListener('click', () => this.handleEraseVault());
    document.getElementById('btn-clear-logs').addEventListener('click', () => this.handleClearLogs());

    // Gold Rate Modal Update click trigger
    document.getElementById('btn-edit-gold-rate').addEventListener('click', () => {
      const currentRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
      document.getElementById('gold-rate-input').value = currentRate > 0 ? currentRate : '';
      document.getElementById('gold-rate-date').value = new Date().toISOString().split('T')[0];
      UI.openModal('modal-gold-rate');
    });
    document.getElementById('btn-save-gold-rate').addEventListener('click', () => this.handleUpdateGoldRate());
  },

  async handleDisconnectVault() {
    const check = confirm("Are you sure you want to disconnect this database?\n\nThis will return you to the setup screen where you can choose a different database.");
    if (!check) return;

    try {
      // Clear in-memory database state
      DBManager.database = null;
      DBManager.activePath = null;
      DBManager.isLoaded = false;

      // Try to clear the persisted path — may fail on iOS (no native file system config),
      // but we still proceed to show the startup screen regardless.
      try {
        await window.electronAPI.setLastDbPath(null);
      } catch (persistErr) {
        console.warn('Could not clear persisted DB path (expected on mobile):', persistErr);
      }

      UI.showToast('Database disconnected.');
      await Startup.showStartupScreen();
    } catch (err) {
      UI.showToast('Failed to disconnect: ' + err.message, true);
    }
  },

  /**
   * Update Universal 24KT Gold Rate
   */
  async handleUpdateGoldRate() {
    const newRate = Number(document.getElementById('gold-rate-input').value || 0);
    const dateVal = document.getElementById('gold-rate-date').value;

    if (newRate <= 0) {
      UI.showToast("Please enter a valid rate price.", true);
      return;
    }
    if (!dateVal) {
      UI.showToast("Effective date is required.", true);
      return;
    }

    const oldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    
    // Update DB
    DBManager.database.settings.goldRate24kt = {
      ratePerGram: newRate,
      effectiveDate: dateVal,
      updatedAt: new Date().toISOString()
    };

    // Logging rate rotation
    const changes = [
      { field: '24KT Gold Rate per Gram', old: `₹${oldRate.toLocaleString()}`, new: `₹${newRate.toLocaleString()}` },
      { field: 'Rate Effective Date', old: DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate || 'None' : 'None', new: dateVal }
    ];
    DBManager.addLog("GOLD_RATE_UPDATE", "gold_rate_24kt", "Universal Gold Rate", `Updated global gold price from ₹${oldRate.toLocaleString()} to ₹${newRate.toLocaleString()}`, changes);

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-gold-rate');
      UI.showToast("Valuation rates successfully rotated!");
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Export database backup
   */
  async handleExportBackup() {
    try {
      const defaultName = `mava_gems_backup_${new Date().toISOString().split('T')[0]}.db`;
      const exportPath = await window.electronAPI.exportBackupDialog(defaultName);
      if (!exportPath) return;

      await window.electronAPI.copyFile(DBManager.activePath, exportPath);
      UI.showToast("Database backup successfully exported!");
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Import Database backup
   */
  async handleImportBackup() {
    try {
      const backupPath = await window.electronAPI.importBackupDialog();
      if (!backupPath) return;

      const check = confirm("WARNING: Importing a backup will overwrite your current active database completely. Are you sure you want to proceed?");
      if (!check) return;

      // Copy backup to active database location
      await window.electronAPI.copyFile(backupPath, DBManager.activePath);
      
      // Bootstrap the newly imported database directly!
      await Startup.bootstrapDatabase(DBManager.activePath);
      UI.showToast("Database backup successfully imported!");
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Destructive clear database file
   */
  async handleEraseVault() {
    try {
      // Erase vault by calling initVault directly on the active path
      await DBManager.initVault(DBManager.activePath);

      UI.closeModal('modal-erase-confirm');
      UI.showToast("Vault successfully wiped!");
      
      // Refresh displays directly with the fresh empty database
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast("Failed to erase: " + err.message, true);
    }
  },

  /**
   * Clear logs
   */
  async handleClearLogs() {
    const check = confirm("Are you sure you want to clear the activity log history? The vault will keep a single initialization log.");
    if (!check) return;

    try {
      DBManager.database.logs = [];
      DBManager.addLog("ADD", "vault", "Vault", "Activity logs cleared by administrator.", []);
      await DBManager.saveVault();
      
      UI.showToast("Audit logs successfully cleared.");
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  }
};

window.Settings = Settings;

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
    document.getElementById('btn-clear-logs').addEventListener('click', () => {
      UI.openModal('modal-clear-logs-confirm');
    });
    document.getElementById('btn-clear-logs-confirm').addEventListener('click', () => this.handleClearLogs());

    // Gold Rate Modal Update click trigger
    document.getElementById('btn-edit-gold-rate').addEventListener('click', () => {
      const currentRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
      document.getElementById('gold-rate-input').value = currentRate > 0 ? currentRate : '';
      document.getElementById('gold-rate-date').value = new Date().toISOString().split('T')[0];
      UI.openModal('modal-gold-rate');
    });
    document.getElementById('btn-save-gold-rate').addEventListener('click', () => this.handleUpdateGoldRate());

    // USD/INR Rate Modal click trigger
    document.getElementById('btn-edit-usd-rate').addEventListener('click', () => {
      const currentRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
      document.getElementById('usd-rate-input').value = currentRate > 0 ? currentRate : '';
      document.getElementById('usd-rate-date').value = new Date().toISOString().split('T')[0];
      UI.openModal('modal-usd-rate');
    });
    document.getElementById('btn-save-usd-rate').addEventListener('click', () => this.handleUpdateUsdRate());

    // Privacy Policy modal trigger
    const privacyBtn = document.getElementById('btn-view-privacy-policy');
    if (privacyBtn) {
      privacyBtn.addEventListener('click', () => UI.openModal('modal-privacy-policy'));
    }

    // Initialize Cloud Sync & OneDrive Backup UI
    this.initCloudSyncUI();
    this.initOneDriveBackupUI();
  },

  handleDisconnectVault() {
    UI.confirm("Are you sure you want to disconnect this database?\n\nThis will return you to the setup screen where you can choose a different database.", async () => {
      try {
        await DBManager.disconnectVault();
        document.getElementById('view-settings').classList.remove('active');
        document.getElementById('view-dashboard').classList.remove('active');
        document.getElementById('view-catalog').classList.remove('active');
        
        Startup.init();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
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
      UI.closeModal('modal-gold-rate');
      UI.showToast("Valuation rates successfully rotated!");
      App.refreshAllDisplays();
      await DBManager.saveSettings({
        goldRate24kt: {
          ratePerGram: newRate,
          effectiveDate: dateVal,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Update USD to INR Exchange Rate
   */
  async handleUpdateUsdRate() {
    const newRate = Number(document.getElementById('usd-rate-input').value || 0);
    const dateVal = document.getElementById('usd-rate-date').value;

    if (newRate <= 0) {
      UI.showToast("Please enter a valid USD to INR exchange rate.", true);
      return;
    }
    if (!dateVal) {
      UI.showToast("Effective date is required.", true);
      return;
    }

    const oldRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;

    // Update DB
    if (!DBManager.database.settings.usdToInr) {
      DBManager.database.settings.usdToInr = {};
    }
    DBManager.database.settings.usdToInr = {
      rate: newRate,
      effectiveDate: dateVal,
      updatedAt: new Date().toISOString()
    };

    // Log
    const changes = [
      { field: 'USD to INR Rate', old: `₹${oldRate.toLocaleString()}`, new: `₹${newRate.toLocaleString()}` },
      { field: 'Rate Effective Date', old: DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.effectiveDate || 'None' : 'None', new: dateVal }
    ];
    DBManager.addLog("GOLD_RATE_UPDATE", "usd_to_inr", "USD/INR Exchange Rate", `Updated USD/INR rate from ₹${oldRate.toLocaleString()} to ₹${newRate.toLocaleString()}`, changes);

    try {
      UI.closeModal('modal-usd-rate');
      UI.showToast("USD/INR exchange rate updated!");
      App.refreshAllDisplays();
      await DBManager.saveSettings({
        usdToInr: {
          rate: newRate,
          effectiveDate: dateVal,
          updatedAt: new Date().toISOString()
        }
      });
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

      UI.confirm("WARNING: Importing a backup will overwrite your current active database completely. Are you sure you want to proceed?", async () => {
        try {
          // Copy backup to active database location
          await window.electronAPI.copyFile(backupPath, DBManager.activePath);
          
          // Bootstrap the newly imported database directly!
          await Startup.bootstrapDatabase(DBManager.activePath);
          UI.showToast("Database backup successfully imported!");
        } catch (err) {
          UI.showToast(err.message, true);
        }
      });
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
   * Clear logs (supporting suite-specific or global clearing)
   */
  async handleClearLogs() {
    try {
      const scope = document.getElementById('clear-logs-scope-select')?.value || 'current';
      const targetSuite = scope === 'current' ? (window.App?.selectedLogSuite || window.App?.activeApp || 'all') : 'all';

      if (!DBManager.database.logs) DBManager.database.logs = [];

      if (targetSuite === 'all') {
        DBManager.database.logs = [];
        DBManager.addLog("ADD", "vault", "Vault", "All activity logs cleared by administrator.", [], 'system');
        UI.showToast("All activity logs successfully cleared.");
      } else {
        const suiteName = targetSuite.toUpperCase();
        DBManager.database.logs = DBManager.database.logs.filter(l => (l.suite || DBManager.inferSuite(l)) !== targetSuite);
        DBManager.addLog("ADD", "vault", "Vault", `${suiteName} Suite activity logs cleared by administrator.`, [], targetSuite);
        UI.showToast(`${suiteName} Suite activity logs cleared.`);
      }

      UI.closeModal('modal-clear-logs-confirm');
      App.refreshAllDisplays();
      await DBManager.saveVault();
    } catch (err) {
      UI.closeModal('modal-clear-logs-confirm');
      UI.showToast(err.message, true);
    }
  },

  /**
   * Wire Cloud Sync (Option A - Firebase Firestore) UI
   */
  initCloudSyncUI() {
    const btnSyncNow = document.getElementById('btn-cloud-sync-now');
    if (btnSyncNow) {
      btnSyncNow.addEventListener('click', async () => {
        if (!window.CloudSync) return;
        UI.showToast("Initiating cloud synchronization...");
        btnSyncNow.disabled = true;
        try {
          const res = await window.CloudSync.syncAll(DBManager.database, { forceFull: true });
          if (res.success) {
            UI.showToast("Cloud sync complete! All catalog data verified.");
            if (res.updated) App.refreshAllDisplays();
          } else {
            UI.showToast(res.error || "Sync status updated: Local vault protected.", false);
          }
        } catch (e) {
          UI.showToast("Cloud sync note: " + e.message, false);
        } finally {
          btnSyncNow.disabled = false;
        }
      });
    }

    const btnConfigCloud = document.getElementById('btn-configure-cloud-sync');
    if (btnConfigCloud) {
      btnConfigCloud.addEventListener('click', () => {
        if (!window.CloudSync) return;
        const cfg = window.CloudSync.config || {};
        const inputProj = document.getElementById('cloud-config-project-id');
        const inputKey = document.getElementById('cloud-config-api-key');
        const inputBucket = document.getElementById('cloud-config-storage-bucket');
        const inputPrefix = document.getElementById('cloud-config-prefix');
        const chkEnabled = document.getElementById('cloud-config-enabled');

        if (inputProj) inputProj.value = cfg.projectId || '';
        if (inputKey) inputKey.value = cfg.apiKey || '';
        if (inputBucket) inputBucket.value = cfg.storageBucket || 'mava-gems-ios.firebasestorage.app';
        if (inputPrefix) inputPrefix.value = cfg.collectionPrefix || 'mava_catalog';
        if (chkEnabled) chkEnabled.checked = Boolean(cfg.enabled);

        UI.openModal('modal-cloud-sync-config');
      });
    }

    const btnSaveConfig = document.getElementById('btn-save-cloud-config');
    if (btnSaveConfig) {
      btnSaveConfig.addEventListener('click', () => {
        if (!window.CloudSync) return;
        const inputProj = document.getElementById('cloud-config-project-id');
        const inputKey = document.getElementById('cloud-config-api-key');
        const inputBucket = document.getElementById('cloud-config-storage-bucket');
        const inputPrefix = document.getElementById('cloud-config-prefix');
        const chkEnabled = document.getElementById('cloud-config-enabled');

        window.CloudSync.saveConfig({
          projectId: inputProj ? inputProj.value.trim() : 'mava-gems-ios',
          apiKey: inputKey ? inputKey.value.trim() : '',
          storageBucket: inputBucket ? inputBucket.value.trim() : 'mava-gems-ios.firebasestorage.app',
          collectionPrefix: inputPrefix ? inputPrefix.value.trim() : 'mava_catalog',
          enabled: chkEnabled ? chkEnabled.checked : true
        });

        UI.closeModal('modal-cloud-sync-config');
        UI.showToast("Cloud synchronization configuration saved!");
      });
    }

    const btnTestConfig = document.getElementById('btn-test-cloud-config');
    if (btnTestConfig) {
      btnTestConfig.addEventListener('click', async () => {
        if (!window.CloudSync) return;
        btnTestConfig.disabled = true;
        try {
          UI.showToast("Testing cloud connection...");
          const res = await window.CloudSync.syncAll(DBManager.database);
          if (res.success) {
            UI.showToast("Connection successful! Cloud backend is reachable.");
          } else {
            UI.showToast("Cloud test note: " + (res.error || "Vault safely protected."), false);
          }
        } catch (err) {
          UI.showToast("Connection test: " + err.message, false);
        } finally {
          btnTestConfig.disabled = false;
        }
      });
    }

    // Status listener
    if (window.CloudSync && typeof window.CloudSync.onStatusChange === 'function') {
      window.CloudSync.onStatusChange((status, message, lastTime) => {
        const badge = document.getElementById('cloud-sync-badge-status');
        const timeDisplay = document.getElementById('cloud-sync-last-time');
        if (badge) {
          if (status === 'online') {
            badge.textContent = 'Cloud Sync Active';
            badge.style.background = 'rgba(46, 204, 113, 0.15)';
            badge.style.color = 'var(--emerald-green, #2ecc71)';
            badge.style.borderColor = 'rgba(46, 204, 113, 0.3)';
          } else if (status === 'syncing') {
            badge.textContent = 'Syncing...';
            badge.style.background = 'rgba(52, 152, 219, 0.15)';
            badge.style.color = '#3498db';
            badge.style.borderColor = 'rgba(52, 152, 219, 0.3)';
          } else if (status === 'offline') {
            badge.textContent = 'Local Vault Protected';
            badge.style.background = 'rgba(243, 156, 18, 0.15)';
            badge.style.color = '#f39c12';
            badge.style.borderColor = 'rgba(243, 156, 18, 0.3)';
          } else {
            badge.textContent = 'Cloud Sync Ready';
            badge.style.background = 'rgba(212,175,55,0.15)';
            badge.style.color = 'var(--text-gold-dark)';
            badge.style.borderColor = 'rgba(212,175,55,0.3)';
          }
        }
        if (timeDisplay && lastTime) {
          try {
            timeDisplay.textContent = new Date(lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          } catch (_) {
            timeDisplay.textContent = lastTime;
          }
        }
      });
    }
  },

  /**
   * Wire Automated Daily OneDrive Backup UI
   */
  initOneDriveBackupUI() {
    const btnRunBackup = document.getElementById('btn-run-onedrive-backup');
    if (btnRunBackup) {
      btnRunBackup.addEventListener('click', async () => {
        if (!window.BackupManager) return;
        btnRunBackup.disabled = true;
        try {
          UI.showToast("Creating daily OneDrive backup snapshot...");
          const res = await window.BackupManager.backupNow();
          if (res.success) {
            UI.showToast(`Daily backup complete! Verified as ${res.fileName}`);
          } else {
            UI.showToast("Backup error: " + (res.error || res.reason), true);
          }
        } catch (err) {
          UI.showToast("Backup failed: " + err.message, true);
        } finally {
          btnRunBackup.disabled = false;
        }
      });
    }

    const btnChooseDir = document.getElementById('btn-choose-onedrive-dir');
    if (btnChooseDir) {
      const isMobile = window.isMobilePlatform ? window.isMobilePlatform() : (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
      if (isMobile) {
        btnChooseDir.textContent = "Share Today's Backup to OneDrive / Files";
      }

      btnChooseDir.addEventListener('click', async () => {
        if (!window.BackupManager) return;
        if (isMobile) {
          try {
            await window.BackupManager.exportToOneDriveMobile();
            UI.showToast("Backup exported to share sheet!");
          } catch (e) {
            UI.showToast("Export error: " + e.message, true);
          }
        } else {
          try {
            const chosen = await window.BackupManager.chooseOneDriveDirectory();
            if (chosen) {
              const display = document.getElementById('onedrive-folder-display');
              if (display) display.textContent = chosen;
              UI.showToast("OneDrive directory updated and today's backup created!");
            }
          } catch (e) {
            UI.showToast("Directory selection: " + e.message, true);
          }
        }
      });
    }

    const toggleAuto = document.getElementById('toggle-auto-daily-backup');
    if (toggleAuto) {
      if (window.BackupManager) {
        toggleAuto.checked = Boolean(window.BackupManager.config.enabled);
      }
      toggleAuto.addEventListener('change', (e) => {
        if (window.BackupManager) {
          window.BackupManager.saveConfig({ enabled: e.target.checked });
          UI.showToast(e.target.checked ? "Automated daily backup enabled." : "Automated daily backup paused.");
        }
      });
    }

    // Status listener
    if (window.BackupManager && typeof window.BackupManager.onStatusChange === 'function') {
      window.BackupManager.onStatusChange((status, info) => {
        const badge = document.getElementById('onedrive-badge-status');
        const dateDisplay = document.getElementById('onedrive-last-date');
        const folderDisplay = document.getElementById('onedrive-folder-display');

        if (badge) {
          const today = window.BackupManager.getTodayString();
          if (info.lastBackupDate === today) {
            badge.textContent = `Today's Backup Verified (${today})`;
            badge.style.background = 'rgba(46, 204, 113, 0.15)';
            badge.style.color = 'var(--emerald-green, #2ecc71)';
            badge.style.borderColor = 'rgba(46, 204, 113, 0.3)';
          } else {
            badge.textContent = `Today's Backup Pending`;
            badge.style.background = 'rgba(243, 156, 18, 0.15)';
            badge.style.color = '#f39c12';
            badge.style.borderColor = 'rgba(243, 156, 18, 0.3)';
          }
        }

        if (dateDisplay) {
          dateDisplay.textContent = info.lastBackupDate
            ? `${info.lastBackupDate} (${info.lastBackupTime ? new Date(info.lastBackupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''})`
            : 'None yet today';
        }

        if (folderDisplay && info.oneDrivePath) {
          folderDisplay.textContent = info.oneDrivePath;
        }
      });
    }
  }
};

window.Settings = Settings;


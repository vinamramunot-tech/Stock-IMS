/**
 * Startup Module
 * Manages database initialization, connecting, and the onboarding screens.
 */

const Startup = {
  init() {
    // Onboarding setup button click listeners
    document.getElementById('btn-startup-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-open').addEventListener('click', () => this.handleOpenExistingVault());

    // Confirmation screen button click listeners
    document.getElementById('btn-startup-continue').addEventListener('click', () => this.handleStartupContinue());
    document.getElementById('btn-startup-confirm-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-confirm-open').addEventListener('click', () => this.handleOpenExistingVault());

    // Startup Screen Keyboard Navigation (Arrow Keys & Enter)
    window.addEventListener('keydown', (e) => {
      const startupScreen = document.getElementById('startup-screen');
      if (!startupScreen || startupScreen.classList.contains('hidden')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      const confirmView = document.getElementById('startup-confirm-path-view');
      const initialView = document.getElementById('startup-initial-setup-view');

      let options = [];
      if (confirmView && !confirmView.classList.contains('hidden')) {
        options = [
          'btn-startup-continue',
          'btn-startup-confirm-create',
          'btn-startup-confirm-open',
          'btn-startup-toggle-theme'
        ];
      } else if (initialView && !initialView.classList.contains('hidden')) {
        options = [
          'btn-startup-create',
          'btn-startup-open',
          'btn-startup-toggle-theme'
        ];
      }

      if (options.length === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        this.startupFocusIndex = (this.startupFocusIndex + 1) % options.length;
        this.updateStartupFocus(options);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        this.startupFocusIndex = (this.startupFocusIndex - 1 + options.length) % options.length;
        this.updateStartupFocus(options);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const currentId = options[this.startupFocusIndex] || options[0];
        const el = document.getElementById(currentId);
        if (el) el.click();
      }
    });

    // Cloud Header Status Widget & Interactive Popover
    const cloudStatusHeader = document.getElementById('vault-info-container');
    const cloudPopover = document.getElementById('cloud-status-popover');
    if (cloudStatusHeader && cloudPopover) {
      cloudStatusHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = cloudPopover.classList.contains('hidden');
        if (isHidden) {
          cloudPopover.classList.remove('hidden');
          if (window.CloudSync && typeof window.CloudSync.measureLatency === 'function') {
            window.CloudSync.measureLatency().then(ping => {
              const latEl = document.getElementById('cloud-popover-latency');
              if (latEl && ping) latEl.textContent = `${ping.latencyMs} ms`;
            });
          }
        } else {
          cloudPopover.classList.add('hidden');
        }
      });

      // Close popover when clicking anywhere outside
      document.addEventListener('click', (e) => {
        if (!cloudPopover.classList.contains('hidden') && !cloudPopover.contains(e.target) && !cloudStatusHeader.contains(e.target)) {
          cloudPopover.classList.add('hidden');
        }
      });
    }

    const btnPopoverSync = document.getElementById('btn-popover-sync-now');
    if (btnPopoverSync) {
      btnPopoverSync.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.CloudSync && typeof window.CloudSync.syncAll === 'function') {
          const spinIcon = document.getElementById('popover-sync-spin-icon');
          if (spinIcon) spinIcon.classList.add('rotating');
          btnPopoverSync.disabled = true;
          try {
            await window.CloudSync.syncAll(DBManager.database, { forceFull: true });
            if (window.App && typeof window.App.refreshAllDisplays === 'function') {
              window.App.refreshAllDisplays();
            }
          } finally {
            btnPopoverSync.disabled = false;
            if (spinIcon) spinIcon.classList.remove('rotating');
          }
        }
      });
    }

    const btnPopoverSettings = document.getElementById('btn-popover-settings');
    if (btnPopoverSettings) {
      btnPopoverSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cloudPopover) cloudPopover.classList.add('hidden');
        if (window.App && typeof window.App.switchTab === 'function') {
          window.App.switchTab('tab-settings');
        }
      });
    }

    // Mobile action bar buttons
    const btnMobileHome = document.getElementById('btn-mobile-home');
    if (btnMobileHome) {
      btnMobileHome.addEventListener('click', () => {
        if (window.App && typeof window.App.showLauncher === 'function') {
          window.App.showLauncher();
        }
      });
    }

    const btnMobileSync = document.getElementById('btn-mobile-sync-cloud');
    if (btnMobileSync) {
      btnMobileSync.addEventListener('click', async () => {
        if (window.CloudSync && typeof window.CloudSync.syncAll === 'function') {
          if (window.UI) UI.showToast("Synchronizing with cloud catalog...");
          await window.CloudSync.syncAll(DBManager.database, { forceFull: true });
          if (window.UI) UI.showToast("Cloud sync complete!");
          if (window.App && typeof window.App.refreshAllDisplays === 'function') {
            window.App.refreshAllDisplays();
          }
        }
      });
    }

    // Live Cloud Status Header & Popover updates
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.onStatusChange === 'function') {
      window.CloudSync.onStatusChange((status, message, lastTime, meta) => {
        const textEl = document.getElementById('cloud-header-status-text');
        const dotEl = document.getElementById('cloud-header-dot');
        const badgePending = document.getElementById('cloud-header-pending-count');
        const popoverPill = document.getElementById('cloud-popover-pill');
        const popoverLastTime = document.getElementById('cloud-popover-last-time');
        const popoverQueue = document.getElementById('cloud-popover-queue-count');
        const popoverLatency = document.getElementById('cloud-popover-latency');

        const queueCount = (meta && typeof meta.pendingQueueCount === 'number')
          ? meta.pendingQueueCount
          : (window.CloudSync.getPendingQueueCount ? window.CloudSync.getPendingQueueCount() : 0);

        if (badgePending) {
          if (queueCount > 0) {
            badgePending.textContent = String(queueCount);
            badgePending.classList.remove('hidden');
          } else {
            badgePending.classList.add('hidden');
          }
        }

        if (popoverQueue) popoverQueue.textContent = `${queueCount} pending`;
        if (popoverLatency && meta && meta.latencyMs) popoverLatency.textContent = `${meta.latencyMs} ms`;

        if (popoverLastTime && lastTime) {
          try {
            popoverLastTime.textContent = new Date(lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          } catch (_) {
            popoverLastTime.textContent = lastTime;
          }
        }

        if (status === 'syncing') {
          if (textEl) {
            textEl.textContent = 'Syncing...';
            textEl.style.color = '#f39c12';
          }
          if (dotEl) dotEl.style.backgroundColor = '#f39c12';
          if (popoverPill) {
            popoverPill.textContent = 'Syncing...';
            popoverPill.style.background = 'rgba(243, 156, 18, 0.15)';
            popoverPill.style.color = '#f39c12';
          }
        } else if (status === 'offline' || status === 'error') {
          if (textEl) {
            textEl.textContent = 'Offline (Local Safe)';
            textEl.style.color = '#e74c3c';
          }
          if (dotEl) dotEl.style.backgroundColor = '#e74c3c';
          if (popoverPill) {
            popoverPill.textContent = 'Offline';
            popoverPill.style.background = 'rgba(231, 76, 60, 0.15)';
            popoverPill.style.color = '#e74c3c';
          }
        } else {
          if (textEl) {
            textEl.textContent = 'Live';
            textEl.style.color = 'var(--success-green, #2ecc71)';
          }
          if (dotEl) dotEl.style.backgroundColor = 'var(--success-green, #2ecc71)';
          if (popoverPill) {
            popoverPill.textContent = 'Live';
            popoverPill.style.background = 'rgba(46, 204, 113, 0.15)';
            popoverPill.style.color = 'var(--emerald-green, #2ecc71)';
          }
        }
      });

      // Also listen to direct queue-changed events
      window.addEventListener('mava:queue-changed', (e) => {
        const count = e && e.detail ? e.detail.count : 0;
        const badgePending = document.getElementById('cloud-header-pending-count');
        const popoverQueue = document.getElementById('cloud-popover-queue-count');
        if (badgePending) {
          if (count > 0) {
            badgePending.textContent = String(count);
            badgePending.classList.remove('hidden');
          } else {
            badgePending.classList.add('hidden');
          }
        }
        if (popoverQueue) popoverQueue.textContent = `${count} pending`;
      });
    }

    // Instant Launch: Automatically boot active database and load directly into Catalog
    this.autoBoot();
  },

  /**
   * Auto-boot active database without blocking startup screen.
   * Directly opens into Catalog / Dashboard with cloud synchronization in background.
   */
  async autoBoot() {
    // Ensure all overlay screens are suppressed immediately
    const ss = document.getElementById('startup-screen');
    if (ss) {
      ss.classList.add('hidden');
      ss.style.display = 'none';
    }
    const ls = document.getElementById('app-launcher-screen');
    if (ls) {
      ls.classList.add('hidden');
      ls.style.display = 'none';
    }
    const ws = document.getElementById('app-workspace');
    if (ws) {
      ws.classList.remove('hidden');
      ws.style.display = '';
    }

    try {
      let activePath = 'mava_gems_stock.db';
      if (window.electronAPI && typeof window.electronAPI.getLastDbPath === 'function') {
        const saved = await window.electronAPI.getLastDbPath();
        if (saved && String(saved).trim().length > 0) {
          activePath = saved.trim();
        }
      }

      let fileInfo = null;
      try {
        if (window.electronAPI && typeof window.electronAPI.readVault === 'function') {
          fileInfo = await window.electronAPI.readVault(activePath);
        }
      } catch (_) {}

      if (fileInfo && fileInfo.exists) {
        await this.bootstrapDatabase(activePath);
        return;
      }

      // On new installation, automatically initialize local vault and hydrate from cloud
      await DBManager.initVault(activePath || 'mava_gems_stock.db');
      await this.bootstrapDatabase(activePath || 'mava_gems_stock.db');
    } catch (err) {
      console.warn("AutoBoot recovering seamlessly:", err);
      try {
        await DBManager.initVault('mava_gems_stock.db');
        await this.bootstrapDatabase('mava_gems_stock.db');
      } catch (e) {
        console.error("Critical boot recovery failure:", e);
      }
    }
  },

  startupFocusIndex: 0,

  updateStartupFocus(options) {
    options.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (idx === this.startupFocusIndex) {
        el.classList.add('kb-highlight');
        el.focus({ preventScroll: true });
      } else {
        el.classList.remove('kb-highlight');
      }
    });
  },

  async showStartupScreen() {
    const ws = document.getElementById('app-workspace');
    if (ws) ws.classList.add('hidden');
    const ls = document.getElementById('app-launcher-screen');
    if (ls) ls.classList.add('hidden');
    const ss = document.getElementById('startup-screen');
    if (ss) ss.classList.remove('hidden');

    try {
      const rememberedPath = await window.electronAPI.getLastDbPath();
      const initView = document.getElementById('startup-initial-setup-view');
      const confView = document.getElementById('startup-confirm-path-view');
      const pathText = document.getElementById('startup-db-path-text');

      if (rememberedPath && String(rememberedPath).trim().length > 0) {
        if (initView) initView.classList.add('hidden');
        if (confView) confView.classList.remove('hidden');
        if (pathText) pathText.textContent = rememberedPath;
      } else {
        if (confView) confView.classList.add('hidden');
        if (initView) initView.classList.remove('hidden');
      }
    } catch (err) {
      console.warn("Failed to get last DB path:", err);
      const confView = document.getElementById('startup-confirm-path-view');
      if (confView) confView.classList.add('hidden');
      const initView = document.getElementById('startup-initial-setup-view');
      if (initView) initView.classList.remove('hidden');
    }

    this.startupFocusIndex = 0;
    const confirmView = document.getElementById('startup-confirm-path-view');
    if (confirmView && !confirmView.classList.contains('hidden')) {
      this.updateStartupFocus(['btn-startup-continue', 'btn-startup-confirm-create', 'btn-startup-confirm-open', 'btn-startup-toggle-theme']);
    } else {
      this.updateStartupFocus(['btn-startup-create', 'btn-startup-open', 'btn-startup-toggle-theme']);
    }
  },

  hideStartupScreen() {
    const ss = document.getElementById('startup-screen');
    if (ss) {
      ss.classList.add('hidden');
      ss.style.display = 'none';
    }
    const ls = document.getElementById('app-launcher-screen');
    if (ls) {
      ls.classList.add('hidden');
      ls.style.display = 'none';
    }
    const ws = document.getElementById('app-workspace');
    if (ws) {
      ws.classList.remove('hidden');
      ws.style.display = '';
    }
    if (window.App && typeof window.App.launchApp === 'function') {
      window.App.launchApp('jewelry');
    }
    if (window.BiometricAuth && typeof window.BiometricAuth.checkAndShowOnboardingPrompt === 'function') {
      setTimeout(() => window.BiometricAuth.checkAndShowOnboardingPrompt(), 500);
    }
  },

  async handleStartupCreate() {
    try {
      const isMobile = window.isMobilePlatform ? window.isMobilePlatform() : (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      if (isMobile) {
        if (window.UI && typeof window.UI.prompt === 'function') {
          window.UI.prompt(
            "Create New Database",
            "Enter a name for your new database file:",
            "mava_gems_stock.db",
            async (dbName) => {
              if (!dbName) return;
              dbName = dbName.trim();
              if (!dbName.endsWith('.db') && !dbName.endsWith('.json')) {
                dbName += '.db';
              }
              await this.executeCreateDatabase(dbName);
            }
          );
        } else {
          let dbName = prompt("Enter a name for your new database file:\n(e.g. mava_gems_stock.db)", "mava_gems_stock.db");
          if (dbName === null) return;
          dbName = (dbName || "mava_gems_stock.db").trim();
          if (!dbName.endsWith('.db') && !dbName.endsWith('.json')) {
            dbName += '.db';
          }
          await this.executeCreateDatabase(dbName);
        }
      } else {
        const chosenPath = await window.electronAPI.createDbDialog();
        if (!chosenPath) return; // User canceled
        await this.executeCreateDatabase(chosenPath);
      }
    } catch (err) {
      console.error("handleStartupCreate error:", err);
      if (window.UI) UI.showToast('Database initialization failure: ' + err.message, true);
    }
  },

  async executeCreateDatabase(chosenPath) {
    try {
      const initResult = await DBManager.initVault(chosenPath);
      if (initResult && initResult.success) {
        this.hideStartupScreen();
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = chosenPath;
          activeInput.title = chosenPath;
        }
        const settingsPath = document.getElementById('settings-vault-path');
        if (settingsPath) settingsPath.textContent = chosenPath;
        const launcherDb = document.getElementById('launcher-db-path-text');
        if (launcherDb) launcherDb.textContent = chosenPath;
        if (window.UI) UI.showToast('Database successfully initialized!');
        if (window.App) App.refreshAllDisplays();
      }
    } catch (err) {
      console.error("executeCreateDatabase error:", err);
      if (window.UI) UI.showToast('Database initialization failure: ' + err.message, true);
    }
  },

  async handleOpenExistingVault() {
    try {
      const selectedPath = await window.electronAPI.openDbDialog();
      if (!selectedPath) return;

      const isStartupScreenVisible = !document.getElementById('startup-screen')?.classList.contains('hidden');
      if (DBManager.isLoaded && !isStartupScreenVisible) {
        UI.confirm('Select a database file (.db) to switch to. Your current session will be replaced.', async () => {
          try {
            await Startup.bootstrapDatabase(selectedPath);
          } catch (err) {
            UI.showToast("Failed to open vault: " + err.message, true);
          }
        });
        return;
      }

      await Startup.bootstrapDatabase(selectedPath);
    } catch (err) {
      UI.showToast("Failed to open vault: " + err.message, true);
    }
  },

  async handleStartupContinue() {
    try {
      const rememberedPath = await window.electronAPI.getLastDbPath();
      if (rememberedPath) {
        await this.bootstrapDatabase(rememberedPath);
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Database load failure: " + err.message, true);
    }
  },

  async handleVaultPathChange(newPath) {
    if (!newPath) {
      UI.showToast("Please enter a valid database path.", true);
      const activeInput = document.getElementById('active-vault-input');
      if (activeInput) activeInput.value = DBManager.activePath || '';
      return;
    }
    try {
      const loadResult = await DBManager.loadVault(newPath);
      if (loadResult.success) {
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = newPath;
          activeInput.title = newPath;
        }
        document.getElementById('settings-vault-path').textContent = newPath;
        UI.showToast("Successfully connected to the new database!");
        App.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      if (err.message.includes("does not exist")) {
        UI.confirm("The specified database file does not exist.\n\nWould you like to initialize a new database at this path?", async () => {
          try {
            const initResult = await DBManager.initVault(newPath);
            if (initResult.success) {
              const activeInput = document.getElementById('active-vault-input');
              if (activeInput) {
                activeInput.value = newPath;
                activeInput.title = newPath;
              }
              document.getElementById('settings-vault-path').textContent = newPath;
              UI.showToast("Database successfully initialized!");
              App.refreshAllDisplays();
            }
          } catch (initErr) {
            UI.showToast("Failed to initialize database: " + initErr.message, true);
            const activeInput = document.getElementById('active-vault-input');
            if (activeInput) activeInput.value = DBManager.activePath || '';
          }
        });
      } else {
        UI.showToast("Failed to connect to database: " + err.message, true);
        // Revert input field value
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) activeInput.value = DBManager.activePath || '';
      }
    }
  },

  /**
   * Bootstrap Database loading routine.
   */
  async bootstrapDatabase(customPath) {
    if (!customPath) {
      await this.showStartupScreen();
      return;
    }
    try {
      const loadResult = await DBManager.loadVault(customPath);
      
      if (loadResult.success) {
        this.hideStartupScreen();
        // Populate path indicators in UI
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = customPath;
          activeInput.title = customPath;
        }
        const settingsPath = document.getElementById('settings-vault-path');
        if (settingsPath) settingsPath.textContent = customPath;
        const launcherDb = document.getElementById('launcher-db-path-text');
        if (launcherDb) launcherDb.textContent = 'Synchronized (mava-gems-ios)';
        
        UI.showToast("Catalog synchronized successfully!");
        if (window.App && window.App.dirtyTabs) {
          window.App.dirtyTabs.clear();
        }
        if (window.App && typeof window.App.refreshAllDisplays === 'function') {
          window.App.refreshAllDisplays();
        }
        if (window.Catalog && typeof window.Catalog.renderCatalogGrid === 'function') {
          window.Catalog.renderCatalogGrid();
        }
        if (window.EmeraldController && typeof window.EmeraldController.renderEmeraldGrid === 'function') {
          window.EmeraldController.renderEmeraldGrid();
        }
        if (window.StoneController && typeof window.StoneController.renderStoneGrid === 'function') {
          window.StoneController.renderStoneGrid();
        }

        // Automated Daily OneDrive Backup check on startup
        if (window.BackupManager && typeof window.BackupManager.checkAndRunDailyBackup === 'function') {
          window.BackupManager.checkAndRunDailyBackup().catch(e => console.warn("Startup backup check:", e));
        }

        // Background Cloud Sync pull on startup
        if (window.CloudSync && typeof window.CloudSync.syncAll === 'function' && window.CloudSync.isEnabled()) {
          window.CloudSync.syncAll(window.DBManager.database).then(res => {
            if (res && res.updated && window.App && typeof window.App.refreshAllDisplays === 'function') {
              window.App.refreshAllDisplays();
            }
          }).catch(e => console.warn("Startup cloud sync:", e));
        }
      }
    } catch (err) {
      console.warn("Vault load failure, auto-recovering with default cloud-backed vault:", err.message);
      try {
        await DBManager.initVault('mava_gems_stock.db');
        const retry = await DBManager.loadVault('mava_gems_stock.db');
        if (retry && retry.success) {
          this.hideStartupScreen();
          if (window.App && typeof window.App.refreshAllDisplays === 'function') {
            window.App.refreshAllDisplays();
          }
          if (window.CloudSync && typeof window.CloudSync.syncAll === 'function' && window.CloudSync.isEnabled()) {
            window.CloudSync.syncAll(window.DBManager.database).then(res => {
              if (res && res.updated && window.App && typeof window.App.refreshAllDisplays === 'function') {
                window.App.refreshAllDisplays();
              }
            }).catch(e => console.warn("AutoBoot cloud sync:", e));
          }
          return;
        }
      } catch (recoveryErr) {
        console.error("Auto recovery error:", recoveryErr);
      }
      UI.showToast("Database file read failure: " + err.message, true);
      await this.showStartupScreen();
    }
  },

  /**
   * Mobile-only: open a file picker, validate and load the chosen database,
   * then cleanly replace the active vault — no null-activePath race condition.
   */
  async handleMobileChangeDb() {
    try {
      UI.confirm('Select a database file (.db) to switch to. Your current session will be replaced.', async () => {
        try {
          const chosenPath = await window.electronAPI.mobilePickAndLoadDb();
          if (!chosenPath) return; // user cancelled

          // If we got here the file was already written to disk at chosenPath;
          // just bootstrap from it.
          await Startup.bootstrapDatabase(chosenPath);
        } catch (err) {
          console.error('Mobile change DB error:', err);
          UI.showToast('Failed to switch database: ' + err.message, true);
        }
      });
    } catch (err) {
      console.error('Mobile change DB wrapper error:', err);
      UI.showToast('Failed to start DB switch: ' + err.message, true);
    }
  }
};

window.Startup = Startup;

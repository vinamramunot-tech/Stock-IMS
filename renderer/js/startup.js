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

    // Editable database path listener (on enter connect) and browse button listener
    const activeVaultInput = document.getElementById('active-vault-input');
    if (activeVaultInput) {
      activeVaultInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleVaultPathChange(e.target.value.trim());
        }
      });
    }
    const btnBrowseVault = document.getElementById('btn-browse-vault');
    if (btnBrowseVault) {
      btnBrowseVault.addEventListener('click', () => this.handleOpenExistingVault());
    }

    // Mobile action bar buttons
    const btnMobileHome = document.getElementById('btn-mobile-home');
    if (btnMobileHome) {
      btnMobileHome.addEventListener('click', () => this.showStartupScreen());
    }

    // Always show the Startup / Database Setup landing screen on launch
    // (exact same behavior on both desktop and mobile/TestFlight)
    this.showStartupScreen();
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
    document.getElementById('startup-screen').classList.add('hidden');
    if (window.App) {
      window.App.showLauncher();
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
        if (launcherDb) launcherDb.textContent = customPath;
        
        UI.showToast("Database successfully loaded!");
        App.refreshAllDisplays();
      }
    } catch (err) {
      console.warn("Vault load failure:", err.message);
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

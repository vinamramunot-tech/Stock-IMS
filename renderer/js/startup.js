/**
 * Startup Module
 * Manages database initialization, connecting, and the onboarding screens.
 */

const Startup = {
  init() {
    // Onboarding setup button click listeners
    document.getElementById('btn-startup-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-open').addEventListener('click', () => this.handleStartupOpen());

    // Confirmation screen button click listeners
    document.getElementById('btn-startup-continue').addEventListener('click', () => this.handleStartupContinue());
    document.getElementById('btn-startup-confirm-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-confirm-open').addEventListener('click', () => this.handleStartupOpen());

    // Global keydown event listener to confirm database path when Enter is pressed
    window.addEventListener('keydown', (e) => {
      const confirmView = document.getElementById('startup-confirm-path-view');
      const startupScreen = document.getElementById('startup-screen');
      if (
        confirmView && !confirmView.classList.contains('hidden') &&
        startupScreen && !startupScreen.classList.contains('hidden') &&
        e.key === 'Enter'
      ) {
        e.preventDefault();
        this.handleStartupContinue();
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
      btnBrowseVault.addEventListener('click', () => this.handleStartupOpen());
    }

    // Mobile action bar buttons
    const btnMobileHome = document.getElementById('btn-mobile-home');
    if (btnMobileHome) {
      btnMobileHome.addEventListener('click', () => this.showStartupScreen());
    }
    const btnMobileChangeDb = document.getElementById('btn-mobile-change-db');
    if (btnMobileChangeDb) {
      btnMobileChangeDb.addEventListener('click', () => this.handleMobileChangeDb());
    }

    this.showStartupScreen();
  },

  async showStartupScreen() {
    const rememberedPath = await window.electronAPI.getLastDbPath();
    if (rememberedPath) {
      document.getElementById('startup-initial-setup-view').classList.add('hidden');
      document.getElementById('startup-confirm-path-view').classList.remove('hidden');
      document.getElementById('startup-db-path-text').textContent = rememberedPath;
    } else {
      document.getElementById('startup-confirm-path-view').classList.add('hidden');
      document.getElementById('startup-initial-setup-view').classList.remove('hidden');
    }
    document.getElementById('app-workspace').classList.add('hidden');
    document.getElementById('startup-screen').classList.remove('hidden');
  },

  hideStartupScreen() {
    document.getElementById('startup-screen').classList.add('hidden');
    document.getElementById('app-workspace').classList.remove('hidden');
  },

  async handleStartupCreate() {
    try {
      let chosenPath;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // Native file dialog unavailable on iOS — use a fixed default path
        // (Tauri on iOS places app data in the app sandbox Documents dir)
        chosenPath = await window.electronAPI.getLastDbPath() || 'mava_gems_stock.db';
      } else {
        chosenPath = await window.electronAPI.createDbDialog();
      }

      if (!chosenPath) return; // User canceled (desktop only)

      const initResult = await DBManager.initVault(chosenPath);
      if (initResult.success) {
        this.hideStartupScreen();
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = chosenPath;
          activeInput.title = chosenPath;
        }
        document.getElementById('settings-vault-path').textContent = chosenPath;
        UI.showToast('Database successfully initialized!');
        App.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      UI.showToast('Database initialization failure: ' + err.message, true);
    }
  },

  async handleStartupOpen() {
    try {
      const chosenPath = await window.electronAPI.openDbDialog();
      if (!chosenPath) return; // User canceled

      await this.bootstrapDatabase(chosenPath);
    } catch (err) {
      console.error(err);
      UI.showToast("Database connection failure: " + err.message, true);
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
      UI.showToast("Failed to connect to database: " + err.message, true);
      // Revert input field value
      const activeInput = document.getElementById('active-vault-input');
      if (activeInput) activeInput.value = DBManager.activePath || '';
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
        document.getElementById('settings-vault-path').textContent = customPath;
        
        UI.showToast("Database successfully loaded!");
        App.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        // Automatically initialize default database file if it doesn't exist on mobile
        try {
          await DBManager.initVault(customPath);
          this.hideStartupScreen();
          const activeInput = document.getElementById('active-vault-input');
          if (activeInput) {
            activeInput.value = customPath;
            activeInput.title = customPath;
          }
          document.getElementById('settings-vault-path').textContent = customPath;
          UI.showToast("Database successfully initialized!");
          App.refreshAllDisplays();
          return;
        } catch (initErr) {
          console.error("Auto-initialization failed on mobile:", initErr);
        }
      }
      UI.showToast("Database file read failure: " + err.message, true);
      await this.showStartupScreen(); // Redirect back to setup screen if file is corrupted/missing
    }
  },

  /**
   * Mobile-only: open a file picker, validate and load the chosen database,
   * then cleanly replace the active vault — no null-activePath race condition.
   */
  async handleMobileChangeDb() {
    try {
      const check = confirm('Select a database file (.db) to switch to. Your current session will be replaced.');
      if (!check) return;

      const chosenPath = await window.electronAPI.mobilePickAndLoadDb();
      if (!chosenPath) return; // user cancelled

      // If we got here the file was already written to disk at chosenPath;
      // just bootstrap from it.
      await this.bootstrapDatabase(chosenPath);
    } catch (err) {
      console.error('Mobile change DB error:', err);
      UI.showToast('Failed to switch database: ' + err.message, true);
    }
  }
};

window.Startup = Startup;

/**
 * Biometric Authentication & Face ID Security Controller for Mava Gems
 * Enforces native iOS Face ID security protocols, App Switcher confidentiality protection,
 * instant automatic launch lock with zero buttons, automatic background resume security,
 * one-time onboarding prompt for new/updated users, and Settings toggle verification.
 */

const BiometricAuth = {
  isInitialized: false,
  isCurrentlyAuthenticating: false,
  biometryType: 'none', // 'faceId' | 'touchId' | 'passcode' | 'none'
  isAvailable: false,
  lastBackgroundTime: 0,

  /**
   * Check if Face ID protection is enabled by user
   */
  isFaceIdEnabled() {
    // Check localStorage first for synchronous zero-latency launch read
    const localVal = localStorage.getItem('face_id_enabled');
    if (localVal !== null) {
      return localVal === 'true';
    }
    // Fallback to database settings if present
    if (window.DBManager && DBManager.database?.settings?.security?.faceIdEnabled !== undefined) {
      const dbVal = !!DBManager.database.settings.security.faceIdEnabled;
      localStorage.setItem('face_id_enabled', dbVal ? 'true' : 'false');
      return dbVal;
    }
    return false;
  },

  /**
   * Persist Face ID setting across localStorage, DBManager, and native iOS UserDefaults
   */
  async setFaceIdEnabled(enabled) {
    localStorage.setItem('face_id_enabled', enabled ? 'true' : 'false');
    if (window.DBManager && DBManager.database) {
      if (!DBManager.database.settings) DBManager.database.settings = {};
      if (!DBManager.database.settings.security) DBManager.database.settings.security = {};
      DBManager.database.settings.security.faceIdEnabled = enabled;
      try {
        await DBManager.saveVault();
      } catch (err) {
        console.warn("Could not save vault security setting:", err);
      }
    }
    // Sync with native iOS UserDefaults
    try {
      await this.callNativeMethod('setFaceIdEnabled', { enabled });
    } catch (_) {}
    this.updateSettingsUI();
  },

  /**
   * Check if the user has already received the one-time Face ID enablement prompt
   * (for new installations or users upgrading from older app versions)
   */
  isFaceIdPrompted() {
    const localVal = localStorage.getItem('face_id_prompted');
    if (localVal !== null) {
      return localVal === 'true';
    }
    if (window.DBManager && DBManager.database?.settings?.security?.faceIdPrompted !== undefined) {
      const dbVal = !!DBManager.database.settings.security.faceIdPrompted;
      localStorage.setItem('face_id_prompted', dbVal ? 'true' : 'false');
      return dbVal;
    }
    return false;
  },

  /**
   * Persist that the user has received the one-time prompt so they are never nagged again
   */
  async setFaceIdPrompted(prompted = true) {
    localStorage.setItem('face_id_prompted', prompted ? 'true' : 'false');
    if (window.DBManager && DBManager.database) {
      if (!DBManager.database.settings) DBManager.database.settings = {};
      if (!DBManager.database.settings.security) DBManager.database.settings.security = {};
      DBManager.database.settings.security.faceIdPrompted = prompted;
      try {
        await DBManager.saveVault();
      } catch (err) {
        console.warn("Could not save vault security setting:", err);
      }
    }
  },

  /**
   * Resolve native Capacitor plugin instance or proxy
   */
  getNativePlugin() {
    if (window.Capacitor?.Plugins?.BiometricAuth) {
      return window.Capacitor.Plugins.BiometricAuth;
    }
    if (window.Capacitor && typeof window.Capacitor.registerPlugin === 'function') {
      try {
        const reg = window.Capacitor.registerPlugin('BiometricAuth');
        if (reg) return reg;
      } catch (_) {}
    }
    return null;
  },

  /**
   * Invoke native method safely through plugin or nativePromise
   */
  async callNativeMethod(method, options = {}) {
    const plugin = this.getNativePlugin();
    if (plugin && typeof plugin[method] === 'function') {
      return await plugin[method](options);
    }
    if (window.Capacitor && typeof window.Capacitor.nativePromise === 'function') {
      return await window.Capacitor.nativePromise('BiometricAuth', method, options);
    }
    return null;
  },

  /**
   * Initialize Biometric Auth on app boot
   */
  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Check hardware biometry availability from iOS
    await this.detectBiometryCapabilities();

    // Tap anywhere on lock screen to retry Face ID if user cancelled system prompt
    const lockScreen = document.getElementById('biometric-lock-screen');
    if (lockScreen) {
      lockScreen.addEventListener('click', () => {
        if (!this.isCurrentlyAuthenticating && this.isFaceIdEnabled()) {
          this.authenticateAndUnlock("Authenticate to access Mava Gems");
        }
      });
    }

    // Wire up settings toggle switch
    const toggleEl = document.getElementById('toggle-face-id-lock');
    if (toggleEl) {
      toggleEl.addEventListener('change', (e) => {
        this.handleToggleChange(e.target);
      });
    }

    // Wire up test button in settings
    const testBtn = document.getElementById('btn-test-biometric-auth');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        this.handleTestPrompt();
      });
    }

    // Wire up Onboarding Enable button
    const onboardingEnableBtn = document.getElementById('btn-face-id-onboarding-enable');
    if (onboardingEnableBtn) {
      onboardingEnableBtn.addEventListener('click', async () => {
        onboardingEnableBtn.disabled = true;
        const res = await this.authenticate({
          reason: "Confirm Face ID to secure your trade vault"
        });
        onboardingEnableBtn.disabled = false;

        if (res.success) {
          await this.setFaceIdEnabled(true);
          await this.setFaceIdPrompted(true);
          if (window.UI) {
            UI.closeModal('modal-face-id-onboarding');
            UI.showToast("Face ID Protection Enabled! Your vault is now secure.");
          }
          if (window.Capacitor?.Plugins?.Haptics) {
            try { window.Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }); } catch (_) {}
          }
        } else {
          if (window.UI) {
            UI.showToast(res.error || "Authentication not completed.", true);
          }
        }
      });
    }

    // Wire up Onboarding Skip / Not Now button
    const onboardingSkipBtn = document.getElementById('btn-face-id-onboarding-skip');
    if (onboardingSkipBtn) {
      onboardingSkipBtn.addEventListener('click', async () => {
        await this.setFaceIdPrompted(true);
        if (window.UI) {
          UI.closeModal('modal-face-id-onboarding');
        }
      });
    }

    // Wire up close trigger on onboarding modal
    const onboardingCloseBtn = document.querySelector('.modal-close-trigger-face-id-onboarding');
    if (onboardingCloseBtn) {
      onboardingCloseBtn.addEventListener('click', async () => {
        await this.setFaceIdPrompted(true);
        if (window.UI) {
          UI.closeModal('modal-face-id-onboarding');
        }
      });
    }

    // Initialize background / foreground transition listener
    this.initLifecycleListener();

    // Update settings UI status badge & toggle state
    this.updateSettingsUI();

    // If enabled, execute immediate automatic launch security prompt (no buttons required)
    if (this.isFaceIdEnabled()) {
      this.promptOnLaunch();
    } else {
      this.unlockApp();
      // For new installs or users updating from older versions:
      // Show onboarding prompt once if startup screen is not blocking
      setTimeout(() => {
        const startupEl = document.getElementById('startup-screen');
        if (!startupEl || startupEl.classList.contains('hidden')) {
          this.checkAndShowOnboardingPrompt();
        }
      }, 1200);
    }
  },

  /**
   * Detect biometry capabilities via Capacitor native plugin
   */
  async detectBiometryCapabilities() {
    try {
      if (window.Capacitor) {
        const info = await this.callNativeMethod('checkBiometry', {});
        if (info) {
          this.isAvailable = !!info.isAvailable;
          this.biometryType = info.biometryType || (info.hasBiometrics ? 'faceId' : 'passcode');
          return;
        }
      }
    } catch (e) {
      console.warn("Biometric detection note:", e);
    }

    // Default fallback
    this.isAvailable = true;
    this.biometryType = 'faceId';
  },

  /**
   * Prompt user with native Face ID / Touch ID / Passcode
   * Directly invokes Apple's LocalAuthentication framework via Capacitor
   */
  async authenticate(options = {}) {
    const reason = options.reason || "Authenticate to access Mava Gems Vault";

    // 1. Native iOS Capacitor on iPhone
    if (window.Capacitor) {
      try {
        const res = await this.callNativeMethod('authenticate', {
          reason,
          allowDeviceCredential: true
        });
        if (res && typeof res === 'object') {
          return { success: !!res.authenticated };
        }
      } catch (err) {
        return { success: false, error: err.message || 'Authentication cancelled or failed' };
      }
    }

    // 2. Desktop Web / Tauri development fallback (no fake simulation alerts)
    return { success: true };
  },

  /**
   * Check and display the one-time Face ID onboarding prompt
   * (only displayed once to newly installed users or users updating from older app versions)
   */
  checkAndShowOnboardingPrompt() {
    // If Face ID is already active, user is already protected
    if (this.isFaceIdEnabled()) return;
    // If user was already prompted previously, never display again
    if (this.isFaceIdPrompted()) return;

    if (window.UI && typeof window.UI.openModal === 'function') {
      window.UI.openModal('modal-face-id-onboarding');
    }
  },

  /**
   * App launch security protocol: Lock immediately and auto-fire Face ID with zero buttons
   */
  async promptOnLaunch() {
    this.lockApp();
    const statusEl = document.getElementById('biometric-lock-status');
    if (statusEl) {
      statusEl.textContent = "Authenticating with Face ID...";
    }

    // Auto-fire Face ID immediately on launch with zero buttons
    setTimeout(async () => {
      await this.authenticateAndUnlock("Authenticate to access Mava Gems");
    }, 150);
  },

  /**
   * Trigger authentication and unlock app if successful
   */
  async authenticateAndUnlock(reason) {
    if (this.isCurrentlyAuthenticating) return;
    this.isCurrentlyAuthenticating = true;

    const statusEl = document.getElementById('biometric-lock-status');
    if (statusEl) {
      statusEl.textContent = "Authenticating with Face ID...";
    }

    try {
      const res = await this.authenticate({ reason });
      if (res.success) {
        if (window.Capacitor?.Plugins?.Haptics) {
          try { window.Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }); } catch (_) {}
        }
        if (statusEl) statusEl.textContent = "Vault Unlocked!";
        setTimeout(() => {
          this.unlockApp();
        }, 120);
      } else {
        if (statusEl) {
          statusEl.textContent = "Face ID not recognized. Tap anywhere to retry.";
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = "Authentication cancelled. Tap anywhere to retry.";
    } finally {
      this.isCurrentlyAuthenticating = false;
    }
  },

  /**
   * Display the impenetrable lock screen and hide all sensitive trade data
   */
  lockApp() {
    document.documentElement.classList.add('vault-locked');
    const lockScreen = document.getElementById('biometric-lock-screen');
    if (lockScreen) {
      lockScreen.classList.remove('hidden');
      lockScreen.classList.add('active');
    }
  },

  /**
   * Smoothly fade out lock screen once authenticated
   */
  unlockApp() {
    document.documentElement.classList.remove('vault-locked');
    const lockScreen = document.getElementById('biometric-lock-screen');
    if (lockScreen) {
      lockScreen.classList.remove('active');
      lockScreen.classList.add('hidden');
    }
  },

  /**
   * Handle user toggling Face ID in settings with proper security verification
   */
  async handleToggleChange(checkboxEl) {
    const isEnabling = checkboxEl.checked;

    if (isEnabling) {
      // PROTOCOL: Must prove user can authenticate BEFORE enabling Face ID
      checkboxEl.disabled = true;
      const res = await this.authenticate({
        reason: "Verify your Face ID to enable app lock"
      });
      checkboxEl.disabled = false;

      if (res.success) {
        await this.setFaceIdEnabled(true);
        await this.setFaceIdPrompted(true);
        UI.showToast("Face ID protection enabled! Your vault is now secure.");
        if (window.Capacitor?.Plugins?.Haptics) {
          try { window.Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }); } catch (_) {}
        }
      } else {
        checkboxEl.checked = false;
        UI.showToast("Face ID verification canceled or failed.", true);
      }
    } else {
      // PROTOCOL: Must prove identity BEFORE disabling Face ID (prevents prying eyes turning it off)
      checkboxEl.disabled = true;
      const res = await this.authenticate({
        reason: "Authenticate with Face ID to disable app lock"
      });
      checkboxEl.disabled = false;

      if (res.success) {
        await this.setFaceIdEnabled(false);
        UI.showToast("Face ID protection disabled.");
      } else {
        checkboxEl.checked = true;
        UI.showToast("Authentication required to disable security.", true);
      }
    }
  },

  /**
   * Test prompt trigger from Settings button
   */
  async handleTestPrompt() {
    const res = await this.authenticate({
      reason: "Testing Face ID authentication for Mava Gems"
    });
    if (res.success) {
      UI.showToast("Face ID verification succeeded!");
      if (window.Capacitor?.Plugins?.Haptics) {
        try { window.Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }); } catch (_) {}
      }
    } else {
      UI.showToast(res.error || "Face ID verification failed.", true);
    }
  },

  /**
   * Update Settings UI elements (toggle, badge, labels)
   */
  updateSettingsUI() {
    const toggleEl = document.getElementById('toggle-face-id-lock');
    if (toggleEl) {
      toggleEl.checked = this.isFaceIdEnabled();
    }

    const badgeEl = document.getElementById('face-id-badge-status');
    if (badgeEl) {
      if (this.biometryType === 'faceId') {
        badgeEl.textContent = '✨ Face ID Ready';
        badgeEl.style.color = 'var(--text-gold-dark)';
      } else if (this.biometryType === 'touchId') {
        badgeEl.textContent = '👆 Touch ID Ready';
        badgeEl.style.color = '#30D158';
      } else {
        badgeEl.textContent = '🔒 Passcode Ready';
        badgeEl.style.color = 'var(--text-main)';
      }
    }
  },

  /**
   * Listen for app background/resume lifecycle events
   */
  initLifecycleListener() {
    // 1. Standard web visibilitychange
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lastBackgroundTime = Date.now();
      } else {
        this.handleAppResume();
      }
    });

    // 2. Capacitor native App state listener
    if (window.Capacitor?.Plugins?.App) {
      try {
        window.Capacitor.Plugins.App.addListener('appStateChange', (state) => {
          if (!state.isActive) {
            this.lastBackgroundTime = Date.now();
          } else {
            this.handleAppResume();
          }
        });
      } catch (err) {
        console.warn("Capacitor App state listener note:", err);
      }
    }
  },

  /**
   * When app returns to foreground from background, automatically lock and fire Face ID
   */
  handleAppResume() {
    if (!this.isFaceIdEnabled()) return;
    
    // Automatically lock immediately upon returning from background and auto-fire Face ID
    this.lockApp();
    const statusEl = document.getElementById('biometric-lock-status');
    if (statusEl) {
      statusEl.textContent = "Authenticating with Face ID...";
    }
    setTimeout(() => {
      this.authenticateAndUnlock("Authenticate to resume Mava Gems");
    }, 150);
  }
};

window.BiometricAuth = BiometricAuth;

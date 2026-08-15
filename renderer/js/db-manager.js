/**
 * Local Filesystem Database Driver for Mava Gems (Direct-Access Edition)
 * Directly reads and writes plain-text, pretty-printed JSON files on your system.
 */

const DBManager = {
  database: null,       // Loaded database state in JSON format
  activePath: null,     // Active file path of the database
  isLoaded: false,

  // Empty default database structure
  getDefaultStructure() {
    return {
      settings: {
        currency: "₹",
        goldRate24kt: {
          ratePerGram: 0,
          effectiveDate: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString()
        },
        usdToInr: {
          rate: 0,
          effectiveDate: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString()
        }
      },
      items: [],
      emeralds: [],
      memos: [],
      stones: [],
      stoneMemos: [],
      jewelStoneMemos: [],
      jewelryMemos: [],
      jewelrySales: [],
      logs: []
    };
  },

  /**
   * Initialize a brand new default database file at a user-selected path
   */
  async initVault(customPath) {
    if (!customPath) throw new Error("No database file path specified.");
    try {
      const baseDb = this.getDefaultStructure();
      
      // Keep state in memory
      this.database = baseDb;
      this.activePath = customPath;
      this.isLoaded = true;

      // Add initialization log
      this.addLog("ADD", "vault", "Vault", "Initialized plain-text database vault.", []);
      
      // Save directly to disk
      await this.saveVault();
      
      // Save path to local persistent configuration
      await window.electronAPI.setLastDbPath(customPath);
      
      return { success: true, path: customPath };
    } catch (error) {
      console.error("Failed to initialize database:", error);
      const errMsg = (error && error.message) || error;
      throw new Error("Failed to initialize database: " + errMsg);
    }
  },

  /**
   * Load the user-specified database file from the filesystem.
   */
  async loadVault(customPath) {
    if (!customPath) throw new Error("No database file path specified.");
    try {
      const fileInfo = await window.electronAPI.readVault(customPath);
      
      if (!fileInfo.exists) {
        throw new Error("The specified database file does not exist.");
      }

      // Read raw JSON or object payload from disk
      let db = typeof fileInfo.data === 'string' ? JSON.parse(fileInfo.data) : (fileInfo.data || {});
      if (typeof db !== 'object' || db === null || Array.isArray(db)) {
        throw new Error("Unrecognized or corrupted database format.");
      }
      if (!db.settings) db.settings = {};
      if (!db.items) db.items = [];
      if (!db.emeralds) db.emeralds = [];
      if (!db.memos) db.memos = [];
      if (!db.stones) db.stones = [];
      if (!db.jewelStoneMemos) db.jewelStoneMemos = db.stoneMemos || [];
      if (!db.jewelryMemos) db.jewelryMemos = [];
      if (!db.jewelrySales) db.jewelrySales = [];
      if (!db.logs) db.logs = [];

      // Successful load
      this.database = db;
      this.activePath = customPath;
      this.isLoaded = true;

      // Save path to local persistent configuration
      await window.electronAPI.setLastDbPath(customPath);

      return { success: true, path: customPath };
    } catch (error) {
      console.error("Database load failed:", error);
      const errMsg = (error && error.message) || error;
      throw new Error("Failed to load database: " + errMsg);
    }
  },

  _isSaving: false,
  _savePending: false,

  /**
   * Serialize and write the current database state as pretty-printed JSON.
   */
  async saveVault() {
    if (!this.isLoaded || !this.database) {
      throw new Error("No active database loaded; cannot save.");
    }

    if (this._isSaving) {
      this._savePending = true;
      return true;
    }

    this._isSaving = true;

    try {
      // Compress JSON (no indentation) to improve save performance and minimize memory/disk I/O overhead.
      const plainText = JSON.stringify(this.database);
      await window.electronAPI.writeVault(plainText, this.activePath);
      return true;
    } catch (error) {
      console.error("Failed to save database:", error);
      const errMsg = (error && error.message) || error;
      throw new Error("Failed to write to database: " + errMsg);
    } finally {
      this._isSaving = false;
      if (this._savePending) {
        this._savePending = false;
        setTimeout(() => this.saveVault(), 50);
      }
    }
  },

  /**
   * Helper to infer suite from log properties
   */
  inferSuite(log) {
    if (log.suite) return log.suite;
    const tId = String(log.targetId || '').toLowerCase();
    const tName = String(log.targetName || '').toLowerCase();
    const act = String(log.action || '').toUpperCase();
    const det = String(log.details || '').toLowerCase();

    if (act === 'GOLD_RATE_UPDATE' || tId === 'gold_rate_24kt') return 'jewelry';
    if (tId === 'usd_to_inr' || tId === 'vault') return 'system';

    if (
      tId.includes('emerald') ||
      tName.includes('emerald') ||
      tId.startsWith('pudia_') ||
      tName.includes('pudia') ||
      tId.startsWith('memo_') ||
      det.includes('emerald')
    ) {
      return 'emerald';
    }
    if (
      tId.includes('jewel_stone') ||
      tId.startsWith('stone_') ||
      tName.includes('stone') ||
      tId.startsWith('jsm_') ||
      det.includes('loose stone')
    ) {
      return 'stone';
    }
    if (
      tId.startsWith('item_') ||
      tId.startsWith('jm_') ||
      tId.startsWith('jsale_') ||
      tId.startsWith('jewelry_') ||
      det.includes('jewelry') ||
      det.includes('piece')
    ) {
      return 'jewelry';
    }

    return (window.App && window.App.activeApp) ? window.App.activeApp : 'jewelry';
  },

  /**
   * Helper to write an activity log
   */
  addLog(action, targetId, targetName, details, changes = [], suite = null) {
    if (!this.database) return;

    const detectedSuite = suite || (window.App && window.App.activeApp) || this.inferSuite({ action, targetId, targetName, details });
    
    const newLog = {
      id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      suite: detectedSuite, // "jewelry", "emerald", "stone", "system"
      action: action, // "ADD", "EDIT", "DELETE", "GOLD_RATE_UPDATE"
      targetId: targetId,
      targetName: targetName,
      details: details,
      changes: changes // Array of { field, old, new }
    };

    if (!this.database.logs) {
      this.database.logs = [];
    }

    // Keep logs sorted: newest first, max 2000 items
    this.database.logs.unshift(newLog);
    if (this.database.logs.length > 2000) {
      this.database.logs.pop();
    }
  },

  /**
   * Retrieve active database inventory items
   */
  getItems() {
    return this.database ? this.database.items || [] : [];
  },

  /**
   * Retrieve active database emerald items
   */
  getEmeralds() {
    return this.database ? this.database.emeralds || [] : [];
  },

  /**
   * Retrieve active database logs
   */
  getLogs(suiteFilter = null) {
    if (!this.database || !this.database.logs) return [];
    const logs = this.database.logs.map(l => {
      if (!l.suite) l.suite = this.inferSuite(l);
      return l;
    });

    if (!suiteFilter || suiteFilter === 'all') {
      return logs;
    }
    return logs.filter(l => l.suite === suiteFilter);
  },

  /**
   * Retrieve global settings
   */
  getSettings() {
    return this.database ? this.database.settings || {} : {};
  },

  /**
   * Retrieve all memo records
   */
  getMemos() {
    return this.database ? this.database.memos || [] : [];
  },

  /**
   * Retrieve active database stone items
   */
  getStones() {
    return this.database ? this.database.stones || [] : [];
  },

  /**
   * Retrieve all jewel stone memo records
   */
  getJewelStoneMemos() {
    return this.database ? this.database.jewelStoneMemos || [] : [];
  },

  /**
   * Retrieve all stone memo records (fallback)
   */
  getStoneMemos() {
    return this.getJewelStoneMemos();
  },

  /**
   * Retrieve all jewelry memo records
   */
  getJewelryMemos() {
    return this.database ? this.database.jewelryMemos || [] : [];
  },

  /**
   * Retrieve all finished jewelry sales records
   */
  getJewelrySales() {
    return this.database ? this.database.jewelrySales || [] : [];
  },

  /**
   * Disconnect the active database and clear the persistent path.
   */
  async disconnectVault() {
    this.database = null;
    this.activePath = null;
    this.isLoaded = false;
    await window.electronAPI.setLastDbPath(null);
  }
};

window.DBManager = DBManager;

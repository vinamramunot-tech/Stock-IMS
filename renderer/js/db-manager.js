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
        }
      },
      items: [],
      logs: []
    };
  },

  /**
   * Initialize a brand new default database file
   */
  async initVault(customPath) {
    try {
      const baseDb = this.getDefaultStructure();
      const targetPath = customPath || await window.electronAPI.getDefaultPath();
      
      // Keep state in memory
      this.database = baseDb;
      this.activePath = targetPath;
      this.isLoaded = true;

      // Add initialization log
      this.addLog("ADD", "vault", "Vault", "Initialized plain-text database vault.", []);
      
      // Save directly to disk
      await this.saveVault();
      
      return { success: true, path: targetPath };
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw new Error("Failed to initialize database: " + error.message);
    }
  },

  /**
   * Load the database file from the filesystem.
   * If it doesn't exist, automatically initialize a default database.
   */
  async loadVault(customPath) {
    try {
      const targetPath = customPath || await window.electronAPI.getDefaultPath();
      const fileInfo = await window.electronAPI.readVault(targetPath);
      
      if (!fileInfo.exists) {
        // Silent auto-initialization on first boot!
        return await this.initVault(targetPath);
      }

      // Read raw JSON from disk
      const db = JSON.parse(fileInfo.data);

      // Successful load
      this.database = db;
      this.activePath = targetPath;
      this.isLoaded = true;

      return { success: true, path: targetPath };
    } catch (error) {
      console.error("Database load failed:", error);
      throw new Error("Failed to load database. File may be corrupted or in an invalid JSON format: " + error.message);
    }
  },

  /**
   * Serialize and write the current database state as pretty-printed JSON.
   */
  async saveVault() {
    if (!this.isLoaded || !this.database) {
      throw new Error("No active database loaded; cannot save.");
    }

    try {
      // Pretty print JSON (2 spaces indentation) for excellent readability
      const plainText = JSON.stringify(this.database, null, 2);
      await window.electronAPI.writeVault(plainText, this.activePath);
      return true;
    } catch (error) {
      console.error("Failed to save database:", error);
      throw new Error("Failed to write to database: " + error.message);
    }
  },

  /**
   * Helper to write an activity log
   */
  addLog(action, targetId, targetName, details, changes = []) {
    if (!this.database) return;
    
    const newLog = {
      id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      action: action, // "ADD", "EDIT", "DELETE", "GOLD_RATE_UPDATE"
      targetId: targetId,
      targetName: targetName,
      details: details,
      changes: changes // Array of { field, old, new }
    };

    if (!this.database.logs) {
      this.database.logs = [];
    }

    // Keep logs sorted: newest first, max 1000 items
    this.database.logs.unshift(newLog);
    if (this.database.logs.length > 1000) {
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
   * Retrieve active database logs
   */
  getLogs() {
    return this.database ? this.database.logs || [] : [];
  },

  /**
   * Retrieve global settings
   */
  getSettings() {
    return this.database ? this.database.settings || {} : {};
  }
};

window.DBManager = DBManager;

/**
 * Local Filesystem Database Driver for Mava Gems (Direct-Access Edition)
 * Directly reads and writes plain-text, pretty-printed JSON files on your system.
 */

const DBManager = {
  database: {
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
  },
  activePath: 'mava_gems_stock.db',
  isLoaded: true,

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

      // Heal any misallocated memos/logs across arrays
      this.healVaultData(db);

      // Successful load
      this.database = db;
      this.activePath = customPath;
      this.isLoaded = true;

      // Resequence jewelry serial numbers so active inventory count is strictly continuous
      this.resequenceJewelrySno();

      // Save path to local persistent configuration
      await window.electronAPI.setLastDbPath(customPath);

      return { success: true, path: customPath };
    } catch (error) {
      console.error("Database load failed:", error);
      const errMsg = (error && error.message) || error;
      throw new Error("Failed to load database: " + errMsg);
    }
  },

  /**
   * Automatically heals vault database to ensure logs, finished jewelry memos,
   * and stone memos are strictly separated into their dedicated arrays.
   */
  healVaultData(db) {
    if (!db || typeof db !== 'object') return;
    if (!Array.isArray(db.logs)) db.logs = [];
    if (!Array.isArray(db.jewelryMemos)) db.jewelryMemos = [];
    if (!Array.isArray(db.jewelStoneMemos)) db.jewelStoneMemos = [];

    const logsToRestore = [];
    const actualJewelryMemos = [];

    // 1. Separate logs erroneously placed into jewelryMemos
    const remainingJM = [];
    for (const item of db.jewelryMemos) {
      if (!item) continue;
      const isLog = item.action !== undefined || item.targetId !== undefined || (item.details !== undefined && item.suite !== undefined);
      if (isLog) {
        logsToRestore.push(item);
      } else {
        remainingJM.push(item);
      }
    }
    actualJewelryMemos.push(...remainingJM);

    // 2. Separate finished jewelry memos placed into jewelStoneMemos or stoneMemos
    for (const key of ['jewelStoneMemos', 'stoneMemos']) {
      if (Array.isArray(db[key])) {
        const remainingStones = [];
        for (const item of db[key]) {
          if (!item) continue;
          const isJM = (typeof item.id === 'string' && item.id.startsWith('jewelry_memo_')) ||
                       (typeof item.memoNumber === 'string' && item.memoNumber.startsWith('JM-')) ||
                       item.personName !== undefined;
          if (isJM) {
            actualJewelryMemos.push(item);
          } else {
            remainingStones.push(item);
          }
        }
        db[key] = remainingStones;
      }
    }

    // 3. Deduplicate jewelry memos by id
    const seenMemoIds = new Set();
    const dedupedJM = [];
    for (const m of actualJewelryMemos) {
      if (m && m.id) {
        if (!seenMemoIds.has(m.id)) {
          seenMemoIds.add(m.id);
          dedupedJM.push(m);
        }
      } else if (m) {
        dedupedJM.push(m);
      }
    }
    db.jewelryMemos = dedupedJM;

    // 4. Merge restored logs into logs array (deduped by id)
    if (logsToRestore.length > 0) {
      const seenLogIds = new Set(db.logs.map(l => l && l.id).filter(Boolean));
      for (const log of logsToRestore) {
        if (log && log.id) {
          if (!seenLogIds.has(log.id)) {
            seenLogIds.add(log.id);
            db.logs.push(log);
          }
        } else if (log) {
          db.logs.push(log);
        }
      }
    }

    // 5. Automatically heal and reconcile jewelrySales array from sold items and memos
    this.healJewelrySales(db);
  },

  /**
   * Reconciles finished jewelry sales records with items marked as Sold and closed memo records.
   * Ensures that any item sold directly or via a memo is never missing from the jewelrySales ledger.
   */
  healJewelrySales(db) {
    if (!db || typeof db !== 'object') return;
    if (!Array.isArray(db.items)) db.items = [];
    if (!Array.isArray(db.jewelrySales)) db.jewelrySales = [];
    if (!Array.isArray(db.jewelryMemos)) db.jewelryMemos = [];

    const goldRate = (db.settings && db.settings.goldRate24kt) ? Number(db.settings.goldRate24kt.ratePerGram || 0) : 0;
    const items = db.items;
    const memos = db.jewelryMemos;
    const sales = db.jewelrySales;

    const soldItems = items.filter(i => i && i.status === 'Sold');

    soldItems.forEach(item => {
      let sale = sales.find(s => (s.itemId && s.itemId === item.id) || (s.sku && item.sku && s.sku.toLowerCase() === item.sku.toLowerCase()));

      let memoInfo = null;
      for (const m of memos) {
        const mi = (m.items || []).find(it => (it.itemId && it.itemId === item.id) || (it.sku && item.sku && it.sku.toLowerCase() === item.sku.toLowerCase()));
        if (mi && mi.status === 'sold') {
          memoInfo = { memo: m, memoItem: mi };
          if ((mi.soldPrice === undefined || mi.soldPrice === null) && item.soldPrice) {
            mi.soldPrice = item.soldPrice;
          }
          break;
        }
      }

      const evalItem = (typeof Calc !== 'undefined' && Calc.evaluateItem) ? Calc.evaluateItem(item, goldRate) : null;
      const mfgCost = (item.mfgCostPrice && Number(item.mfgCostPrice) > 0)
        ? Number(item.mfgCostPrice)
        : ((evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (evalItem?.marketCostPrice || 0));
      const replacementCost = (evalItem && evalItem.marketCostPrice) ? evalItem.marketCostPrice : mfgCost;
      const soldPrice = Number(item.soldPrice) || (memoInfo?.memoItem?.soldPrice) || (evalItem ? evalItem.sellingPrice : 0);
      const saleDate = item.soldDate || (memoInfo?.memo?.date) || (item.updatedAt ? item.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
      const mfgDate = item.mfgDate || (item.createdAt ? item.createdAt.split('T')[0] : saleDate);
      const customerName = item.soldTo || (memoInfo?.memo?.personName) || 'Direct Sale';
      const brokerName = item.soldBroker || (memoInfo?.memo?.brokerName) || '—';

      const mfgTime = new Date(mfgDate + 'T00:00:00').getTime();
      const saleTime = new Date(saleDate + 'T00:00:00').getTime();
      const diffMs = Math.max(0, saleTime - mfgTime);
      const daysElapsed = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const monthsElapsed = Math.max(0.1, Number((daysElapsed / 30.4375).toFixed(2)));

      const profit = soldPrice - mfgCost;
      const marginPct = mfgCost > 0 ? (profit / mfgCost) * 100 : 0;
      const replacementProfit = soldPrice - replacementCost;
      const replacementMarginPct = replacementCost > 0 ? (replacementProfit / replacementCost) * 100 : 0;
      const goldCommodityGain = replacementCost - mfgCost;
      const monthlyProfitPct = Number((marginPct / monthsElapsed).toFixed(2));

      if (!sale) {
        sale = {
          id: 'jsale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          saleNumber: '',
          saleDate,
          mfgDate,
          daysElapsed,
          monthsElapsed,
          memoId: memoInfo ? memoInfo.memo.id : null,
          memoNumber: memoInfo ? memoInfo.memo.memoNumber : (item.issuedMemoNumber || '—'),
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          customerName,
          brokerName,
          mfgCost,
          replacementCost,
          soldPrice,
          profit,
          mfgProfit: profit,
          marginPct,
          mfgMarginPct: marginPct,
          replacementProfit,
          replacementMarginPct,
          goldCommodityGain,
          monthlyProfitPct,
          notes: item.notes || '',
          createdAt: item.updatedAt || new Date().toISOString()
        };
        sales.push(sale);
      } else {
        if (!sale.sku && item.sku) sale.sku = item.sku;
        if (!sale.name && item.name) sale.name = item.name;
        if (!sale.category && item.category) sale.category = item.category;
        if (!sale.memoId && memoInfo) sale.memoId = memoInfo.memo.id;
        if ((!sale.memoNumber || sale.memoNumber === '—') && memoInfo) sale.memoNumber = memoInfo.memo.memoNumber;
        if (!sale.replacementCost) sale.replacementCost = replacementCost;
        if (!sale.replacementProfit) sale.replacementProfit = replacementProfit;
        if (!sale.replacementMarginPct) sale.replacementMarginPct = replacementMarginPct;
        if (!sale.goldCommodityGain) sale.goldCommodityGain = goldCommodityGain;
      }
    });

    // Chronological order & sequential numbering
    sales.sort((a, b) => {
      const tA = new Date(a.saleDate || a.createdAt || 0).getTime();
      const tB = new Date(b.saleDate || b.createdAt || 0).getTime();
      if (tA !== tB) return tA - tB;
      return (a.sku || '').localeCompare(b.sku || '');
    });

    sales.forEach((s, idx) => {
      s.saleNumber = 'JS-' + String(idx + 1).padStart(4, '0');
    });
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

      // Post-save background enhancements (non-blocking, zero data loss)
      try {
        if (typeof window !== 'undefined') {
          if (window.BackupManager && typeof window.BackupManager.checkAndRunDailyBackup === 'function') {
            window.BackupManager.checkAndRunDailyBackup().catch(e => console.warn("Daily backup background check:", e));
          }
          if (window.CloudSync && typeof window.CloudSync.queueSync === 'function') {
            window.CloudSync.queueSync();
          }
        }
      } catch (bgErr) {
        console.warn("Post-save background hook note:", bgErr);
      }

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
    if (!this.database || !Array.isArray(this.database.jewelryMemos)) return [];
    return this.database.jewelryMemos.filter(m => m && !m.action && !m.targetId && !(m.details && m.suite));
  },

  /**
   * Retrieve all finished jewelry sales records
   */
  getJewelrySales() {
    return this.database ? this.database.jewelrySales || [] : [];
  },

  /**
   * Resequences serial numbers (sno) for active jewelry items (status !== 'Sold').
   * Serial numbers act as the exact count of active inventory (1, 2, 3... N).
   * When items are sold, returned, deleted, or added, serial numbers update sequentially.
   */
  resequenceJewelrySno() {
    if (!this.database || !Array.isArray(this.database.items)) return;

    const activeItems = this.database.items.filter(i => i.status !== 'Sold');
    const soldItems = this.database.items.filter(i => i.status === 'Sold');

    // Sort active items by current valid sno ascending, fallback to createdAt or ID timestamp
    activeItems.sort((a, b) => {
      const snoA = (typeof a.sno === 'number' && !isNaN(a.sno) && a.sno > 0) ? a.sno : Infinity;
      const snoB = (typeof b.sno === 'number' && !isNaN(b.sno) && b.sno > 0) ? b.sno : Infinity;
      if (snoA !== snoB) return snoA - snoB;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id?.split('_')[1] || 0);
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id?.split('_')[1] || 0);
      return tA - tB;
    });

    // Assign consecutive 1..N count
    activeItems.forEach((item, index) => {
      item.sno = index + 1;
    });

    // Sold items do not hold active inventory serial numbers
    soldItems.forEach(item => {
      item.sno = null;
    });
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

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
    logs: [],
    stockLedger: []
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
      logs: [],
      stockLedger: []
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
    if (!Array.isArray(db.stockLedger)) db.stockLedger = [];

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
    // 1. Purge corrupted/test sales & deduplicate existing sales
    const seenSaleKeys = new Set();
    const uniqueSales = [];
    for (const s of db.jewelrySales) {
      if (!s) continue;
      if ((s.id === 'item_1' && !s.name) || (s.sku === 'MG-01' && !s.name)) continue;
      const key = s.itemId ? `item_${s.itemId}` : (s.sku ? `sku_${s.sku.toLowerCase()}` : `id_${s.id}`);
      if (!seenSaleKeys.has(key)) {
        seenSaleKeys.add(key);
        uniqueSales.push(s);
      }
    }
    db.jewelrySales = uniqueSales;
    const sales = db.jewelrySales;

    const soldItems = items.filter(i => {
      if (!i || i.status !== 'Sold') return false;
      // Skip phantom test items or corrupted items without basic identity
      if ((i.id === 'item_1' && !i.name) || (i.sku === 'MG-01' && !i.name) || (i.id === 'piece_101' && !i.name)) return false;
      if (!i.name && !i.sku) return false;
      return true;
    });

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
        const safeSaleId = item.id ? `jsale_${item.id}` : ('jsale_' + (item.sku ? item.sku.toLowerCase().replace(/[^a-z0-9_-]/g, '') : Date.now()));
        sale = {
          id: safeSaleId,
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
        if (!sale.itemId && item.id) sale.itemId = item.id;
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

  _debounceTimer: null,

  /**
   * Canonical collection name mapper between local DB array keys and Firestore collection names.
   */
  _resolveCollectionNames(key) {
    const rawKey = String(key || '').trim();
    const map = {
      items: { dbKey: 'items', firestoreCol: 'mava_catalog_items' },
      mava_catalog_items: { dbKey: 'items', firestoreCol: 'mava_catalog_items' },
      emeralds: { dbKey: 'emeralds', firestoreCol: 'mava_catalog_emeralds' },
      mava_catalog_emeralds: { dbKey: 'emeralds', firestoreCol: 'mava_catalog_emeralds' },
      stones: { dbKey: 'stones', firestoreCol: 'mava_catalog_stones' },
      mava_catalog_stones: { dbKey: 'stones', firestoreCol: 'mava_catalog_stones' },
      jewelryMemos: { dbKey: 'jewelryMemos', firestoreCol: 'mava_catalog_jewelry_memos' },
      mava_catalog_jewelry_memos: { dbKey: 'jewelryMemos', firestoreCol: 'mava_catalog_jewelry_memos' },
      jewelStoneMemos: { dbKey: 'jewelStoneMemos', firestoreCol: 'mava_catalog_jewel_stone_memos' },
      mava_catalog_jewel_stone_memos: { dbKey: 'jewelStoneMemos', firestoreCol: 'mava_catalog_jewel_stone_memos' },
      jewelrySales: { dbKey: 'jewelrySales', firestoreCol: 'mava_catalog_jewelry_sales' },
      mava_catalog_jewelry_sales: { dbKey: 'jewelrySales', firestoreCol: 'mava_catalog_jewelry_sales' },
      emeraldMemos: { dbKey: 'memos', firestoreCol: 'mava_catalog_emerald_memos' },
      mava_catalog_emerald_memos: { dbKey: 'memos', firestoreCol: 'mava_catalog_emerald_memos' },
      memos: { dbKey: 'memos', firestoreCol: 'mava_catalog_emerald_memos' },
      emeraldSales: { dbKey: 'sales', firestoreCol: 'mava_catalog_emerald_sales' },
      mava_catalog_emerald_sales: { dbKey: 'sales', firestoreCol: 'mava_catalog_emerald_sales' },
      sales: { dbKey: 'sales', firestoreCol: 'mava_catalog_emerald_sales' },
      stockLedger: { dbKey: 'stockLedger', firestoreCol: 'mava_catalog_stock_ledger' },
      mava_catalog_stock_ledger: { dbKey: 'stockLedger', firestoreCol: 'mava_catalog_stock_ledger' }
    };
    if (map[rawKey]) return map[rawKey];
    const dbKey = rawKey.replace(/^mava_catalog_/, '');
    const firestoreCol = rawKey.startsWith('mava_catalog_') ? rawKey : `mava_catalog_${rawKey}`;
    return { dbKey, firestoreCol };
  },

  _getCloudSync() {
    if (typeof window !== 'undefined' && window.CloudSync) {
      return window.CloudSync;
    }
    if (typeof global !== 'undefined' && global.CloudSync) {
      return global.CloudSync;
    }
    return null;
  },

  /**
   * Granular save for an individual item into a collection.
   * Updates in-memory database immediately (0ms UI latency),
   * pushes a single lightweight document patch to Firestore (2KB vs 21MB),
   * and debounces the local file flush.
   */
  async saveItem(collectionKey, item) {
    if (!this.database || !item) return false;
    const { dbKey, firestoreCol } = this._resolveCollectionNames(collectionKey);

    if (!Array.isArray(this.database[dbKey])) {
      this.database[dbKey] = [];
    }

    const arr = this.database[dbKey];
    const idVal = item.id || (item.sku ? `item_${item.sku}` : (item.pudiaNumber ? `pudia_${item.pudiaNumber}` : `rec_${Date.now()}`));
    if (!item.id && idVal) item.id = idVal;
    item.updatedAt = new Date().toISOString();

    const idx = arr.findIndex(i => i && String(i.id) === String(idVal));
    if (idx >= 0) {
      arr[idx] = item;
    } else {
      arr.push(item);
    }

    // Direct Firestore patch in background (only this single record!)
    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled()) {
      const opts = {};
      if (item._serverUpdateTime) {
        opts.precondition = { updateTime: item._serverUpdateTime };
      }
      cloudSync.setDocument(firestoreCol, String(item.id), item, opts).then(res => {
        if (res && res._serverUpdateTime) {
          item._serverUpdateTime = res._serverUpdateTime;
        }
      }).catch(err => {
        console.warn(`Granular push ${firestoreCol}/${item.id} note:`, err.message);
      });
    }

    // Debounce the heavy full local disk write
    this.scheduleVaultFlush();
    return true;
  },

  /**
   * Granular field-level patch for an individual item in a collection.
   * Updates only specified fields using Firestore updateMask, avoiding full-document overwrites.
   */
  async patchItem(collectionKey, itemId, fieldsPatch) {
    if (!this.database || !fieldsPatch || typeof fieldsPatch !== 'object') return false;
    const { dbKey, firestoreCol } = this._resolveCollectionNames(collectionKey);
    if (!Array.isArray(this.database[dbKey])) return false;

    const arr = this.database[dbKey];
    const idx = arr.findIndex(i => i && String(i.id) === String(itemId));
    if (idx < 0) return false;

    const item = arr[idx];
    const previousUpdateTime = item._serverUpdateTime || null;
    Object.assign(item, fieldsPatch);
    item.updatedAt = new Date().toISOString();

    const fieldPaths = Object.keys(fieldsPatch);
    if (!fieldPaths.includes('updatedAt')) fieldPaths.push('updatedAt');

    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled()) {
      cloudSync.setDocument(firestoreCol, String(itemId), item, {
        fieldPaths,
        precondition: previousUpdateTime ? { updateTime: previousUpdateTime } : null
      }).then(res => {
        if (res && res._serverUpdateTime) {
          item._serverUpdateTime = res._serverUpdateTime;
        }
      }).catch(err => {
        console.warn(`Granular field patch ${firestoreCol}/${itemId} note:`, err.message);
      });
    }

    this.scheduleVaultFlush();
    return true;
  },

  /**
   * Granular delete for an individual item from a collection.
   */
  async deleteItem(collectionKey, itemId) {
    if (!this.database) return false;
    const { dbKey, firestoreCol } = this._resolveCollectionNames(collectionKey);
    if (!Array.isArray(this.database[dbKey])) return false;

    this.database[dbKey] = this.database[dbKey].filter(i => i && String(i.id) !== String(itemId));

    if (typeof window !== 'undefined' && window.CloudSync && window.CloudSync.isEnabled()) {
      window.CloudSync.deleteDocument(firestoreCol, String(itemId)).catch(err => {
        console.warn(`Granular delete ${firestoreCol}/${itemId} note:`, err.message);
      });
    }

    this.scheduleVaultFlush();
    return true;
  },

  /**
   * Granular settings update: updates valuation and meta in Firestore and local state.
   */
  async saveSettings(settingsPatch) {
    if (!this.database) return false;
    if (!this.database.settings) this.database.settings = {};
    if (settingsPatch && typeof settingsPatch === 'object') {
      this.database.settings = Object.assign(this.database.settings, settingsPatch);
    }
    this.database.settings.updatedAt = new Date().toISOString();

    if (typeof window !== 'undefined' && window.CloudSync && window.CloudSync.isEnabled()) {
      window.CloudSync.setDocument('mava_catalog_meta', 'settings', this.database.settings).catch(err => {
        console.warn('Granular settings push note:', err.message);
      });
    }

    this.scheduleVaultFlush();
    return true;
  },

  /**
   * Debounced vault flush: aggregates rapid local writes into a single disk write
   */
  scheduleVaultFlush(delayMs = 1500) {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    return new Promise((resolve) => {
      this._debounceTimer = setTimeout(async () => {
        this._debounceTimer = null;
        try {
          await this.flushVaultToDisk();
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      }, delayMs);
      if (this._debounceTimer && typeof this._debounceTimer.unref === 'function') {
        this._debounceTimer.unref();
      }
    });
  },

  /**
   * Serialize and write the current database state to disk immediately.
   */
  async saveVault() {
    return await this.flushVaultToDisk();
  },

  /**
   * Physical local disk write routine with backup and cloud queue triggers.
   */
  async flushVaultToDisk() {
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
      this._lastSelfSaveTime = Date.now();
      if (window.electronAPI && typeof window.electronAPI.writeVault === 'function') {
        await window.electronAPI.writeVault(plainText, this.activePath);
      }
      this._lastSelfSaveTime = Date.now();

      // Post-save background enhancements (non-blocking, zero data loss)
      try {
        if (typeof window !== 'undefined') {
          if (window.BackupManager && typeof window.BackupManager.checkAndRunDailyBackup === 'function') {
            window.BackupManager.checkAndRunDailyBackup().catch(e => console.warn("Daily backup background check:", e));
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
        setTimeout(() => this.flushVaultToDisk(), 50);
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

  // =========================================================================
  // Phase 2: Inventory Reservation State Machine
  // Valid states: 'In Stock' -> 'Reserved' -> 'Issued' -> 'Sold'
  // =========================================================================

  /**
   * Check if an inventory item is available to be reserved, issued, or sold.
   */
  checkItemAvailability(item, requestingStaff = null) {
    if (!item) return { available: false, reason: 'Item not found' };
    const status = item.status || 'In Stock';

    if (status === 'Sold') {
      return { available: false, reason: 'Item has already been sold' };
    }
    if (status === 'Issued') {
      return { available: false, reason: `Item is currently out on Memo ${item.issuedMemoNumber || ''}`.trim() };
    }
    if (status === 'Reserved' && item.reservation) {
      const expiresAt = new Date(item.reservation.expiresAt || 0).getTime();
      const now = Date.now();
      if (expiresAt > now) {
        if (requestingStaff && item.reservation.staffName === requestingStaff) {
          return { available: true, selfReserved: true, expiresAt: item.reservation.expiresAt };
        }
        return {
          available: false,
          reason: `Reserved by ${item.reservation.staffName || 'another staff member'} until ${new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          heldBy: item.reservation.staffName,
          expiresAt: item.reservation.expiresAt
        };
      }
      // Reservation has expired
      return { available: true, expiredReservation: true };
    }
    return { available: true };
  },

  /**
   * Atomically reserve an item with a time-limited hold (default 10 minutes).
   */
  async reserveItem(collectionKey, itemId, staffName = 'Staff', durationMinutes = 10, memoRef = null) {
    if (!this.database) return { success: false, reason: 'Database not loaded' };
    const { dbKey } = this._resolveCollectionNames(collectionKey);
    const arr = this.database[dbKey];
    if (!Array.isArray(arr)) return { success: false, reason: 'Collection not found' };

    const idx = arr.findIndex(i => i && String(i.id) === String(itemId));
    if (idx < 0) return { success: false, reason: 'Item not found' };

    const item = arr[idx];
    const availability = this.checkItemAvailability(item, staffName);
    if (!availability.available) {
      return { success: false, reason: availability.reason, heldBy: availability.heldBy, expiresAt: availability.expiresAt };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, durationMinutes) * 60000).toISOString();
    const reservation = {
      staffName: staffName || 'Staff',
      reservedAt: now.toISOString(),
      expiresAt,
      memoRef: memoRef || null
    };

    const fieldsPatch = {
      status: 'Reserved',
      reservation,
      updatedAt: now.toISOString()
    };

    await this.patchItem(collectionKey, itemId, fieldsPatch);

    // Record immutable audit event in stock ledger
    this.recordStockEvent({
      itemId: String(itemId),
      sku: item.sku || null,
      eventType: 'RESERVED',
      staffName: staffName || 'Staff',
      notes: `Reserved for ${durationMinutes} min${memoRef ? ` (Ref: ${memoRef})` : ''}`
    });

    return { success: true, item, expiresAt };
  },

  /**
   * Release an active reservation back to 'In Stock'.
   */
  async releaseReservation(collectionKey, itemId, staffName = null) {
    if (!this.database) return { success: false, reason: 'Database not loaded' };
    const { dbKey } = this._resolveCollectionNames(collectionKey);
    const arr = this.database[dbKey];
    if (!Array.isArray(arr)) return { success: false, reason: 'Collection not found' };

    const idx = arr.findIndex(i => i && String(i.id) === String(itemId));
    if (idx < 0) return { success: false, reason: 'Item not found' };

    const item = arr[idx];
    if (item.status !== 'Reserved') {
      return { success: true, alreadyReleased: true };
    }

    const fieldsPatch = {
      status: 'In Stock',
      reservation: null,
      updatedAt: new Date().toISOString()
    };

    await this.patchItem(collectionKey, itemId, fieldsPatch);

    this.recordStockEvent({
      itemId: String(itemId),
      sku: item.sku || null,
      eventType: 'RESERVATION_RELEASED',
      staffName: staffName || (item.reservation && item.reservation.staffName) || 'System',
      notes: 'Reservation released back to In Stock'
    });

    return { success: true };
  },

  // =========================================================================
  // Phase 4: Event-Sourced Carat & Stock Ledger
  // =========================================================================

  /**
   * Record an immutable stock transition or carat adjustment event.
   */
  recordStockEvent({ itemId = null, sku = null, pudiaNumber = null, eventType, caratsDelta = 0, piecesDelta = 0, referenceId = null, staffName = 'Staff', notes = null }) {
    if (!this.database) return null;
    if (!Array.isArray(this.database.stockLedger)) {
      this.database.stockLedger = [];
    }

    const event = {
      id: `led_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      eventType: eventType || 'NOTE',
      itemId: itemId ? String(itemId) : null,
      sku: sku ? String(sku) : null,
      pudiaNumber: pudiaNumber ? String(pudiaNumber) : null,
      caratsDelta: Number(Number(caratsDelta || 0).toFixed(3)),
      piecesDelta: parseInt(piecesDelta || 0, 10),
      referenceId: referenceId ? String(referenceId) : null,
      staffName: staffName || 'Staff',
      notes: notes || null
    };

    this.database.stockLedger.unshift(event);

    // Keep bounded in local file to avoid indefinite ballooning (keep latest 5,000 events)
    if (this.database.stockLedger.length > 5000) {
      this.database.stockLedger.length = 5000;
    }

    // Direct push to Firestore in background
    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled()) {
      cloudSync.setDocument('mava_catalog_stock_ledger', event.id, event).catch(err => {
        console.warn(`Stock ledger push ${event.id} note:`, err.message);
      });
    }

    this.scheduleVaultFlush();
    return event;
  },

  /**
   * Retrieve the complete chronological ledger for a specific jewelry item or SKU.
   */
  getItemLedger(itemIdOrSku) {
    if (!this.database || !Array.isArray(this.database.stockLedger) || !itemIdOrSku) return [];
    const target = String(itemIdOrSku).toLowerCase();
    return this.database.stockLedger.filter(ev =>
      (ev.itemId && String(ev.itemId).toLowerCase() === target) ||
      (ev.sku && String(ev.sku).toLowerCase() === target)
    );
  },

  /**
   * Retrieve the complete chronological carat deduction/return ledger for an emerald parcel.
   */
  getPudiaLedger(pudiaNumber) {
    if (!this.database || !Array.isArray(this.database.stockLedger) || !pudiaNumber) return [];
    const target = String(pudiaNumber).toLowerCase();
    return this.database.stockLedger.filter(ev =>
      ev.pudiaNumber && String(ev.pudiaNumber).toLowerCase() === target
    );
  },

  /**
   * Reconcile gemstone carats mathematically by summing all ledger events.
   */
  reconcileCaratBalance(pudiaNumber, currentLotWeight = null) {
    const events = this.getPudiaLedger(pudiaNumber);
    let netDeltas = 0;
    for (const ev of events) {
      netDeltas += Number(ev.caratsDelta || 0);
    }
    netDeltas = Number(netDeltas.toFixed(3));

    let lotWeight = currentLotWeight;
    if (lotWeight === null && this.database && Array.isArray(this.database.emeralds)) {
      const pudia = this.database.emeralds.find(e => e && String(e.pudiaNumber || e.color || e.id).toLowerCase() === String(pudiaNumber).toLowerCase());
      if (pudia) lotWeight = Number(pudia.weight || pudia.carats || 0);
    }

    return {
      pudiaNumber,
      eventCount: events.length,
      netDeltas,
      currentLotWeight: lotWeight,
      isConserved: lotWeight !== null ? Math.abs(netDeltas) <= Number(lotWeight) : true
    };
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DBManager;
}
if (typeof window !== 'undefined') {
  window.DBManager = DBManager;
}

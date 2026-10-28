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
        updatedAt: '1970-01-01T00:00:00.000Z'
      },
      usdToInr: {
        rate: 0,
        effectiveDate: new Date().toISOString().split('T')[0],
        updatedAt: '1970-01-01T00:00:00.000Z'
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

  // =========================================================================
  // 1. REACTIVE PUB/SUB EVENT SYSTEM (Vue / MobX / Redux Pattern)
  // Decouples UI modules, allowing tabs and modals to reactively subscribe
  // to entity changes without tight imperative coupling.
  // =========================================================================
  _subscribers: new Map(),

  /**
   * Subscribe to reactive database events
   * @param {string} event - e.g. 'items:saved', 'items:deleted', 'sales:created', 'settings:changed', 'vault:loaded'
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  on(event, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._subscribers.has(event)) this._subscribers.set(event, new Set());
    this._subscribers.get(event).add(callback);
    return () => {
      const set = this._subscribers.get(event);
      if (set) set.delete(callback);
    };
  },

  off(event, callback) {
    const set = this._subscribers.get(event);
    if (set) set.delete(callback);
  },

  emit(event, payload = {}) {
    const set = this._subscribers.get(event);
    if (set) {
      set.forEach(cb => {
        try { cb(payload); } catch (err) { console.error(`Event listener error on ${event}:`, err); }
      });
    }
    // Also dispatch on window for browser-level listeners
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent(`mava:${event}`, { detail: payload }));
      } catch (_) {}
    }
  },

  // =========================================================================
  // 2. NORMALIZED O(1) IDENTITY MAPS & SECONDARY INDEXES (Linear / Redux Pattern)
  // Replaces linear O(N) array scans with sub-millisecond O(1) Hash Map lookups.
  // =========================================================================
  _indexes: {
    itemsById: new Map(),
    itemsBySku: new Map(),
    itemsByStatus: new Map(),
    salesByItemId: new Map(),
    salesBySku: new Map(),
    memosById: new Map(),
    memosByNumber: new Map()
  },

  _rebuildIndexes() {
    this._indexes.itemsById.clear();
    this._indexes.itemsBySku.clear();
    this._indexes.itemsByStatus.clear();
    this._indexes.salesByItemId.clear();
    this._indexes.salesBySku.clear();
    this._indexes.memosById.clear();
    this._indexes.memosByNumber.clear();

    if (!this.database) return;

    // Index Items
    for (const item of (this.database.items || [])) {
      if (!item) continue;
      this._indexItem(item);
    }

    // Index Jewelry Sales
    for (const sale of (this.database.jewelrySales || [])) {
      if (!sale) continue;
      if (sale.itemId) this._indexes.salesByItemId.set(String(sale.itemId), sale);
      if (sale.sku) this._indexes.salesBySku.set(sale.sku.trim().toLowerCase(), sale);
    }

    // Index Jewelry Memos
    for (const memo of (this.database.jewelryMemos || [])) {
      if (!memo) continue;
      if (memo.id) this._indexes.memosById.set(String(memo.id), memo);
      if (memo.memoNumber) this._indexes.memosByNumber.set(memo.memoNumber.trim().toUpperCase(), memo);
    }
  },

  _indexItem(item) {
    if (!item) return;
    if (item.id) this._indexes.itemsById.set(String(item.id), item);
    if (item.sku) this._indexes.itemsBySku.set(item.sku.trim().toLowerCase(), item);
    
    const status = item.status || 'In Stock';
    if (!this._indexes.itemsByStatus.has(status)) {
      this._indexes.itemsByStatus.set(status, new Set());
    }
    this._indexes.itemsByStatus.get(status).add(item);
  },

  _unindexItem(item) {
    if (!item) return;
    if (item.id) this._indexes.itemsById.delete(String(item.id));
    if (item.sku) this._indexes.itemsBySku.delete(item.sku.trim().toLowerCase());
    
    for (const [, set] of this._indexes.itemsByStatus.entries()) {
      set.delete(item);
    }
  },

  // Fast O(1) Lookups
  getItem(id) {
    if (!id) return null;
    return this._indexes.itemsById.get(String(id)) || (this.database?.items || []).find(i => i && String(i.id) === String(id)) || null;
  },

  getItemBySku(sku) {
    if (!sku) return null;
    return this._indexes.itemsBySku.get(String(sku).trim().toLowerCase()) || (this.database?.items || []).find(i => i && i.sku && i.sku.trim().toLowerCase() === String(sku).trim().toLowerCase()) || null;
  },

  getItemsByStatus(status) {
    if (!status) return [];
    if (this._indexes.itemsByStatus.has(status)) {
      return Array.from(this._indexes.itemsByStatus.get(status));
    }
    return (this.database?.items || []).filter(i => i && (i.status || 'In Stock') === status);
  },

  getSaleByItemId(itemId) {
    if (!itemId) return null;
    return this._indexes.salesByItemId.get(String(itemId)) || (this.database?.jewelrySales || []).find(s => s && String(s.itemId) === String(itemId)) || null;
  },

  getSaleBySku(sku) {
    if (!sku) return null;
    return this._indexes.salesBySku.get(String(sku).trim().toLowerCase()) || (this.database?.jewelrySales || []).find(s => s && s.sku && s.sku.trim().toLowerCase() === String(sku).trim().toLowerCase()) || null;
  },

  getMemo(id) {
    if (!id) return null;
    return this._indexes.memosById.get(String(id)) || (this.database?.jewelryMemos || []).find(m => m && String(m.id) === String(id)) || null;
  },

  getMemoByNumber(memoNumber) {
    if (!memoNumber) return null;
    return this._indexes.memosByNumber.get(String(memoNumber).trim().toUpperCase()) || (this.database?.jewelryMemos || []).find(m => m && m.memoNumber && m.memoNumber.trim().toUpperCase() === String(memoNumber).trim().toUpperCase()) || null;
  },

  // =========================================================================
  // 3. DETERMINISTIC IDEMPOTENCY KEY GENERATOR (Square POS & Stripe Pattern)
  // Ensures repeated network retries or multi-client syncs produce identical keys.
  // =========================================================================
  generateIdempotencyKey(domain, primaryId, qualifier) {
    const d = domain || 'tx';
    const id = primaryId || 'gen';
    const q = qualifier ? String(qualifier).replace(/[^a-zA-Z0-9_-]/g, '') : Date.now();
    return `${d}_${id}_${q}`;
  },

  // =========================================================================
  // 4. FINITE STATE MACHINE (FSM) FOR INVENTORY LIFECYCLE (Shopify / NetSuite Pattern)
  // Formally governs state transitions, preventing orphaned sales or phantom states.
  // =========================================================================
  InventoryFSM: {
    VALID_STATUSES: ['In Stock', 'On Memo', 'Issued', 'Sold', 'Reserved'],

    ALLOWED_TRANSITIONS: {
      'In Stock': ['On Memo', 'Issued', 'Sold', 'Reserved'],
      'On Memo':  ['In Stock', 'Sold'],
      'Issued':   ['In Stock', 'Sold'], // Legacy alias for On Memo
      'Reserved': ['In Stock', 'On Memo', 'Issued', 'Sold'],
      'Sold':     ['In Stock'] // Sale Reversal / Return
    },

    canTransition(currentStatus, targetStatus) {
      const from = currentStatus || 'In Stock';
      const to = targetStatus;
      if (from === to) return true;
      const allowed = this.ALLOWED_TRANSITIONS[from];
      return Array.isArray(allowed) && allowed.includes(to);
    },

    transition(item, targetStatus, payload = {}) {
      if (!item) throw new Error('Cannot transition null or undefined item');
      const fromStatus = item.status || 'In Stock';

      if (!this.canTransition(fromStatus, targetStatus)) {
        throw new Error(`Illegal inventory transition: Cannot transition piece "${item.name || item.sku || item.id}" from "${fromStatus}" to "${targetStatus}".`);
      }

      switch (targetStatus) {
        case 'Sold': {
          const price = payload.soldPrice !== undefined ? payload.soldPrice : payload.salePrice;
          if (price === undefined || price === null || isNaN(Number(price))) {
            throw new Error(`Sold transition requires soldPrice for piece ${item.sku || item.id}`);
          }
          item.status = 'Sold';
          item.soldPrice = Number(price);
          item.soldDate = payload.soldDate || new Date().toISOString().split('T')[0];
          item.soldTo = payload.soldTo || payload.customerName || 'Direct Sale';
          if (payload.soldBroker || payload.broker) item.soldBroker = payload.soldBroker || payload.broker;
          if (payload.saleRecordId) item.activeSaleId = payload.saleRecordId;
          break;
        }

        case 'On Memo':
        case 'Issued':
          item.status = targetStatus;
          if (payload.memoId) item.activeMemoId = payload.memoId;
          if (payload.memoNumber) item.issuedMemoNumber = payload.memoNumber;
          if (payload.personName || payload.customerName) item.issuedTo = payload.personName || payload.customerName;
          if (payload.brokerName || payload.broker) item.issuedBroker = payload.brokerName || payload.broker;
          break;

        case 'Reserved':
          item.status = 'Reserved';
          if (payload.reservation) item.reservation = payload.reservation;
          break;

        case 'In Stock':
          item.status = 'In Stock';
          item.activeSaleId = null;
          item.activeMemoId = null;
          item.reservation = null;
          delete item.soldPrice;
          delete item.soldDate;
          delete item.soldTo;
          delete item.soldBroker;
          delete item.issuedMemoNumber;
          delete item.issuedTo;
          delete item.issuedBroker;
          break;
      }

      item.statusChangedAt = new Date().toISOString();
      item.clientMutationId = payload.clientMutationId || `mut_fsm_${item.id || 'it'}_${Date.now()}`;
      item.updatedAt = new Date().toISOString();
      return item;
    },

    transitionItem(item, targetStatus, payload = {}) {
      return this.transition(item, targetStatus, payload);
    }
  },

  /**
   * Atomically transitions an inventory piece through the FSM, updates indexes,
   * emits a reactive event, and schedules a database write.
   */
  transitionItem(itemIdOrItem, targetStatus, payload = {}) {
    const item = typeof itemIdOrItem === 'object' ? itemIdOrItem : this.getItem(itemIdOrItem);
    if (!item) return null;
    const oldStatus = item.status || 'In Stock';
    this.InventoryFSM.transition(item, targetStatus, payload);
    this._indexItem(item);
    this.emit('items:status-changed', { item, from: oldStatus, to: targetStatus, payload });
    this.saveItem('mava_catalog_items', item);
    return item;
  },

  // Empty default database structure
  getDefaultStructure() {
    return {
      settings: {
        currency: "₹",
        goldRate24kt: {
          ratePerGram: 0,
          effectiveDate: new Date().toISOString().split('T')[0],
          updatedAt: '1970-01-01T00:00:00.000Z'
        },
        usdToInr: {
          rate: 0,
          effectiveDate: new Date().toISOString().split('T')[0],
          updatedAt: '1970-01-01T00:00:00.000Z'
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
      this._rebuildIndexes();
      this.emit('vault:loaded', { path: customPath, isNew: true });

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
      this._rebuildIndexes();
      this.emit('vault:loaded', { path: customPath, isNew: false });

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

    // 5. Purge corrupted and phantom items from catalog items
    if (Array.isArray(db.items)) {
      db.items = db.items.filter(item => {
        if (!item) return false;
        const name = String(item.name || '').trim();
        const sku = String(item.sku || '').trim();
        const id = String(item.id || '').trim();
        if (!name && !sku) return false;
        if (id === 'item_1' || id === 'piece_101' || id === 'piece_100' || id === 'piece_200' || id === 'piece_300' || id === 'item_test_event') {
          if (!name || name.toLowerCase().includes('test')) return false;
        }
        if (id.startsWith('piece_100') || id.startsWith('piece_200') || id.startsWith('piece_300')) return false;
        if (sku === 'MG-01' || sku === 'MG-100' || sku === 'MG-200' || sku === 'MG-300' || sku === 'SKU-101') {
          if (!name || name.toLowerCase().includes('test')) return false;
        }
        if (item.status === 'Reserved' && !name && !sku) return false;
        return true;
      });
    }

    // 6. Purge test entries from stock ledger
    if (Array.isArray(db.stockLedger)) {
      db.stockLedger = db.stockLedger.filter(entry => {
        if (!entry) return false;
        const sku = String(entry.sku || '').trim();
        if (sku === 'MG-100' || sku === 'MG-200' || sku === 'MG-300' || sku === 'MG-01' || sku === 'SKU-101') return false;
        if (sku.toLowerCase().includes('test')) return false;
        return true;
      });
    }

    // 7. Automatically heal and reconcile jewelrySales array from sold items and memos
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

    // Assign deterministic idempotency key if not present
    if (!item.clientMutationId) {
      item.clientMutationId = this.generateIdempotencyKey(dbKey, item.id || idVal, item.updatedAt);
    }

    const idx = arr.findIndex(i => i && String(i.id) === String(idVal));
    if (idx >= 0) {
      arr[idx] = item;
    } else {
      arr.push(item);
    }

    // Maintain normalized O(1) indexes
    if (dbKey === 'items') {
      this._indexItem(item);
    } else if (dbKey === 'jewelrySales') {
      if (item.itemId) this._indexes.salesByItemId.set(String(item.itemId), item);
      if (item.sku) this._indexes.salesBySku.set(item.sku.trim().toLowerCase(), item);
    } else if (dbKey === 'jewelryMemos') {
      if (item.id) this._indexes.memosById.set(String(item.id), item);
      if (item.memoNumber) this._indexes.memosByNumber.set(item.memoNumber.trim().toUpperCase(), item);
    }

    // Emit reactive event
    this.emit(`${dbKey}:saved`, { item, id: item.id, collection: firestoreCol });

    // Direct Firestore patch in background (only if not a phantom/test item)
    const isPhantomTestItem = (dbKey === 'items') && (
      (!item.name && !item.sku) ||
      (String(item.id || '').startsWith('piece_100') || String(item.id || '').startsWith('piece_200') || String(item.id || '').startsWith('piece_300')) ||
      (String(item.sku || '') === 'MG-100' || String(item.sku || '') === 'MG-200' || String(item.sku || '') === 'MG-300' || String(item.sku || '') === 'MG-01')
    );

    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled() && !isPhantomTestItem) {
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

    // Maintain normalized O(1) indexes
    if (dbKey === 'items') {
      this._indexItem(item);
    }

    this.emit(`${dbKey}:patched`, { item, id: itemId, fieldsPatch, collection: firestoreCol });

    const fieldPaths = Object.keys(fieldsPatch);
    if (!fieldPaths.includes('updatedAt')) fieldPaths.push('updatedAt');

    const isPhantomTestPatch = (dbKey === 'items') && (
      String(itemId).startsWith('piece_100') || String(itemId).startsWith('piece_200') || String(itemId).startsWith('piece_300') || String(itemId) === 'piece_101'
    );

    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled() && !isPhantomTestPatch) {
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

    const existing = this.database[dbKey].find(i => i && String(i.id) === String(itemId));
    if (dbKey === 'items' && existing) {
      this._unindexItem(existing);
    } else if (dbKey === 'jewelrySales' && existing) {
      if (existing.itemId) this._indexes.salesByItemId.delete(String(existing.itemId));
      if (existing.sku) this._indexes.salesBySku.delete(existing.sku.trim().toLowerCase());
    } else if (dbKey === 'jewelryMemos' && existing) {
      if (existing.id) this._indexes.memosById.delete(String(existing.id));
      if (existing.memoNumber) this._indexes.memosByNumber.delete(existing.memoNumber.trim().toUpperCase());
    }

    this.database[dbKey] = this.database[dbKey].filter(i => i && String(i.id) !== String(itemId));
    this.emit(`${dbKey}:deleted`, { id: itemId, collection: firestoreCol });

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
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.writeVault === 'function') {
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

    // Direct push to Firestore in background (skip test events)
    const isTestSku = sku && (sku === 'MG-100' || sku === 'MG-200' || sku === 'MG-300' || sku === 'MG-01' || sku === 'SKU-101' || sku.toLowerCase().includes('test'));
    const cloudSync = this._getCloudSync();
    if (cloudSync && cloudSync.isEnabled() && !isTestSku) {
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

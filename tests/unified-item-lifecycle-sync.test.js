const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Mock localStorage for Node test environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const DBManager = require(path.join(__dirname, '../renderer/js/db-manager.js'));
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));
const Calc = require(path.join(__dirname, '../renderer/js/calc.js'));

/**
 * Lightweight DOM & VM harness to execute real browser controllers in Node.js
 */
function createControllerHarness() {
  const elements = new Map();
  const toasts = [];

  function makeElement(id = '') {
    return {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      checked: false,
      isConnected: true,
      dataset: {},
      style: {},
      className: '',
      parentNode: null,
      parentElement: null,
      classList: {
        _set: new Set(),
        add(...cls) { cls.forEach(c => this._set.add(c)); },
        remove(...cls) { cls.forEach(c => this._set.delete(c)); },
        toggle(c) {
          if (this._set.has(c)) { this._set.delete(c); return false; }
          this._set.add(c); return true;
        },
        contains(c) { return this._set.has(c); }
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      appendChild() {},
      replaceChildren() {},
      remove() {},
      focus() {}
    };
  }

  function getEl(id) {
    if (!elements.has(id)) {
      elements.set(id, makeElement(id));
    }
    return elements.get(id);
  }

  const documentStub = {
    getElementById: (id) => getEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(tag),
    createDocumentFragment: () => makeElement('fragment'),
    addEventListener: () => {},
    visibilityState: 'visible',
    documentElement: { scrollTop: 0 },
    body: makeElement('body')
  };

  const confirmPromises = [];
  const UIStub = {
    activeItemState: {},
    showToast(msg, isError = false) {
      toasts.push({ msg: String(msg), isError: Boolean(isError) });
    },
    confirm(_msg, onConfirm) {
      if (typeof onConfirm === 'function') {
        const res = onConfirm();
        if (res && typeof res.then === 'function') confirmPromises.push(res);
        return res;
      }
    },
    openModal() {},
    closeModal() {},
    resetForm() {},
    escapeHtml: (s) => String(s ?? ''),
    fmtINR: (n) => `₹${Number(n || 0).toFixed(2)}`,
    debounce: (fn) => fn,
    compressBase64Image: async (img) => img
  };

  const LogsStub = {
    diffItem: () => [],
    buildSummary: (_changes, fallback) => fallback
  };

  const AppStub = {
    refreshCount: 0,
    refreshAllDisplays() {
      this.refreshCount++;
    }
  };

  const windowStub = {
    DBManager,
    CloudSync,
    Calc,
    UI: UIStub,
    Logs: LogsStub,
    App: AppStub,
    localStorage: global.localStorage,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent() {},
    addEventListener() {},
    scrollTo() {},
    scrollY: 0
  };

  const sandbox = {
    window: windowStub,
    globalThis: null,
    document: documentStub,
    localStorage: global.localStorage,
    DBManager,
    CloudSync,
    Calc,
    UI: UIStub,
    Logs: LogsStub,
    App: AppStub,
    CustomEvent: windowStub.CustomEvent,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Promise,
    Error,
    parseFloat,
    parseInt,
    isNaN
  };
  sandbox.globalThis = sandbox;
  windowStub.window = windowStub;
  windowStub.document = documentStub;

  const ctx = vm.createContext(sandbox);

  const controllerFiles = [
    ['catalog.js', 'Catalog'],
    ['jewelry-memo.js', 'JewelryMemoController'],
    ['jewelry-sales.js', 'JewelrySalesController'],
    ['emerald.js', 'EmeraldController'],
    ['memo.js', 'MemoController'],
    ['emerald-sales.js', 'SalesController'],
    ['stone.js', 'StoneController'],
    ['jewel-stone-memo.js', 'JewelStoneMemoController']
  ];

  const controllers = {};
  for (const [file, exportName] of controllerFiles) {
    const code = fs.readFileSync(path.join(__dirname, '../renderer/js', file), 'utf8');
    vm.runInContext(`${code}\n;window.${exportName} = ${exportName};globalThis.${exportName} = ${exportName};`, ctx, { filename: file });
    controllers[exportName] = sandbox[exportName];
  }
  controllers.CatalogController = controllers.Catalog;

  return {
    ...controllers,
    windowStub,
    documentStub,
    UIStub,
    AppStub,
    getEl,
    toasts,
    async flushConfirms() {
      while (confirmPromises.length > 0) {
        const pending = confirmPromises.splice(0, confirmPromises.length);
        await Promise.all(pending);
      }
    }
  };
}

test('Unified Item Lifecycle & Multi-Collection CloudSync Integrity Suite', async (t) => {
  let savedCalls = [];
  let deletedCalls = [];

  t.beforeEach(() => {
    mockStorage.clear();
    savedCalls = [];
    deletedCalls = [];

    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyTestKey',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog',
      realtimeStreamEnabled: false
    });
    CloudSync.clearSnapshots();
    CloudSync.savePendingTombstones([]);
    CloudSync.clearPendingQueue();
    CloudSync.lastSyncTime = null;
    CloudSync.syncInProgress = false;
    CloudSync._syncPending = false;
    CloudSync._syncedDocVersions = new Map();

    // Prevent live network requests in unit tests while recording cloud mutations
    CloudSync.setDocument = async (col, id, data) => {
      savedCalls.push({ col, id, data: JSON.parse(JSON.stringify(data)) });
      return data;
    };
    CloudSync.deleteDocument = async (col, id) => {
      deletedCalls.push({ col, id });
      return true;
    };
    CloudSync.batchWrite = async (ops) => ({ success: true, count: ops.length });

    DBManager._subscribers = new Map();
    DBManager.saveVault = async () => true;
    DBManager.scheduleVaultFlush = () => {};
    DBManager.database = {
      items: [],
      emeralds: [],
      stones: [],
      memos: [],
      jewelryMemos: [],
      jewelStoneMemos: [],
      jewelrySales: [],
      sales: [],
      logs: [],
      stockLedger: [],
      settings: {
        currency: '₹',
        goldRate24kt: { ratePerGram: 7500, updatedAt: '2026-10-30T10:00:00.000Z' },
        usdToInr: { rate: 84, updatedAt: '2026-10-30T10:00:00.000Z' }
      }
    };
    DBManager._rebuildIndexes();
    global.window = {
      DBManager,
      CloudSync,
      Calc,
      CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
      dispatchEvent() {}
    };
  });

  t.afterEach(() => {
    CloudSync.stopRealtimeListener();
    global.window = undefined;
  });

  await t.test('1. Finished Jewelry Catalog Edit Preserves Issued/Sold Lifecycle & Propagates SKU/Name Across Memos & Sales', async () => {
    const h = createControllerHarness();
    global.window = h.windowStub;

    DBManager.database.items = [
      {
        id: 'item_issued_1',
        sno: 1,
        sku: 'MG-OLD-01',
        name: 'Emerald Choker',
        category: 'Necklace',
        grossWeight: 22.5,
        karat: 18,
        status: 'Issued',
        issuedTo: 'Royal Jewels',
        issuedBroker: 'Karan',
        issuedMemoNumber: 'JM-001',
        activeMemoId: 'jmemo_1',
        statusChangedAt: '2026-10-29T10:00:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z'
      },
      {
        id: 'item_sold_2',
        sno: null,
        sku: 'MG-SOLD-02',
        name: 'Ruby Bangle',
        category: 'Bracelet',
        grossWeight: 18.0,
        karat: 18,
        status: 'Sold',
        soldPrice: 240000,
        soldDate: '2026-10-29',
        soldTo: 'Mehta Family',
        soldBroker: 'Direct',
        activeSaleId: 'jsale_item_sold_2',
        statusChangedAt: '2026-10-29T12:00:00.000Z',
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-29T12:00:00.000Z'
      }
    ];
    DBManager.database.jewelryMemos = [
      {
        id: 'jmemo_1',
        memoNumber: 'JM-001',
        status: 'open',
        personName: 'Royal Jewels',
        items: [
          { itemId: 'item_issued_1', sku: 'MG-OLD-01', name: 'Emerald Choker', category: 'Necklace', status: 'open', sellingPrice: 310000 }
        ]
      }
    ];
    DBManager.database.jewelrySales = [
      {
        id: 'jsale_item_sold_2',
        itemId: 'item_sold_2',
        sku: 'MG-SOLD-02',
        name: 'Ruby Bangle',
        category: 'Bracelet',
        soldPrice: 240000,
        customerName: 'Mehta Family',
        itemSnapshot: { id: 'item_sold_2', sku: 'MG-SOLD-02', name: 'Ruby Bangle', category: 'Bracelet' }
      }
    ];
    DBManager._rebuildIndexes();

    // 1A: Edit Issued Piece SKU & Name in Catalog
    h.UIStub.activeItemState = { ...DBManager.database.items[0] };
    h.getEl('item-name').value = 'Imperial Emerald Choker';
    h.getEl('item-sku').value = 'MG-NEW-01';
    h.getEl('item-category').value = 'Necklace';
    h.getEl('item-description').value = 'Updated setting';
    h.getEl('item-labour').value = '15000';
    h.getEl('item-gross-weight').value = '22.5';
    h.getEl('item-karat').value = '18';
    h.getEl('item-wastage').value = '10';
    h.getEl('item-profit-pct').value = '40';

    await h.CatalogController.handleSaveJewelryPiece();

    const updatedIssued = DBManager.getItem('item_issued_1');
    assert.equal(updatedIssued.status, 'Issued', 'Preserves Issued lifecycle state');
    assert.equal(updatedIssued.issuedTo, 'Royal Jewels');
    assert.equal(updatedIssued.issuedMemoNumber, 'JM-001');
    assert.equal(updatedIssued.activeMemoId, 'jmemo_1');
    assert.equal(updatedIssued.sku, 'MG-NEW-01');
    assert.equal(DBManager.getItemBySku('MG-OLD-01'), null, 'Stale SKU removed from secondary index');
    assert.equal(DBManager.getItemBySku('MG-NEW-01').id, 'item_issued_1', 'New SKU indexed');
    assert.equal(DBManager.database.jewelryMemos[0].items[0].sku, 'MG-NEW-01', 'Memo item SKU propagated');
    assert.equal(DBManager.database.jewelryMemos[0].items[0].name, 'Imperial Emerald Choker', 'Memo item Name propagated');

    // 1B: Edit Sold Piece -> keeps status = 'Sold' and sno = null, propagates to Sales Ledger
    h.UIStub.activeItemState = { ...DBManager.database.items[1] };
    h.getEl('item-sno').value = '99'; // Even if form had a number, Sold piece must stay sno = null
    h.getEl('item-name').value = 'Royal Ruby Bangle';
    h.getEl('item-sku').value = 'MG-SOLD-02R';
    h.getEl('item-category').value = 'Bracelet';
    h.getEl('item-gross-weight').value = '18.0';

    await h.CatalogController.handleSaveJewelryPiece();

    const updatedSold = DBManager.getItem('item_sold_2');
    assert.equal(updatedSold.status, 'Sold', 'Preserves Sold status');
    assert.equal(updatedSold.sno, null, 'Sold item never receives an active S.No');
    assert.equal(updatedSold.soldPrice, 240000);
    assert.equal(DBManager.database.jewelrySales[0].sku, 'MG-SOLD-02R', 'Sale SKU propagated');
    assert.equal(DBManager.database.jewelrySales[0].name, 'Royal Ruby Bangle', 'Sale Name propagated');
    assert.equal(DBManager.database.jewelrySales[0].itemSnapshot.sku, 'MG-SOLD-02R', 'Sale snapshot updated');

    // 1C: Deleting Issued or Sold item is strictly blocked
    await h.CatalogController.handleDeleteItem(updatedIssued);
    assert.ok(DBManager.getItem('item_issued_1'), 'Issued item cannot be deleted');
    await h.CatalogController.handleDeleteItem(updatedSold);
    assert.ok(DBManager.getItem('item_sold_2'), 'Sold item cannot be deleted');
  });

  await t.test('2. Direct Sale Auto-Closes Active Memo, Edit-Sale Syncs All 3 Collections, and Return-Sale Cleans Nulls & Indexes', async () => {
    const h = createControllerHarness();
    global.window = h.windowStub;

    DBManager.database.items = [
      {
        id: 'piece_a',
        sno: 1,
        sku: 'MG-A1',
        name: ' Zambian Ring',
        category: 'Ring',
        grossWeight: 8.5,
        karat: 18,
        mfgDate: '2026-10-01',
        status: 'Issued',
        issuedTo: 'Client Alpha',
        issuedBroker: 'Broker Raj',
        issuedMemoNumber: 'JM-010',
        activeMemoId: 'jmemo_10'
      },
      {
        id: 'piece_b',
        sno: 2,
        sku: 'MG-B2',
        name: 'Diamond Studs',
        category: 'Earrings',
        grossWeight: 5.0,
        karat: 18,
        status: 'In Stock'
      }
    ];
    DBManager.database.jewelryMemos = [
      {
        id: 'jmemo_10',
        memoNumber: 'JM-010',
        status: 'open',
        personName: 'Client Alpha',
        brokerName: 'Broker Raj',
        totalValue: 120000,
        items: [
          { itemId: 'piece_a', sku: 'MG-A1', name: 'Zambian Ring', category: 'Ring', status: 'open', sellingPrice: 120000 }
        ]
      }
    ];
    // Pre-seed a non-canonical duplicate sale to verify automatic deduplication on sale confirmation
    DBManager.database.jewelrySales = [
      { id: 'legacy_dup_sale', itemId: 'piece_a', sku: 'MG-A1', soldPrice: 115000 }
    ];
    DBManager._rebuildIndexes();

    // 2A: Confirm Direct Sale (memoId left empty, simulating direct sale from Catalog while item is on open memo)
    h.getEl('jewelry-sale-id').value = '';
    h.getEl('jewelry-sale-memo-id').value = '';
    h.getEl('jewelry-sale-item-index').value = '-1';
    h.getEl('jewelry-sale-item-id').value = 'piece_a';
    h.getEl('jewelry-sale-customer-name').value = 'Client Alpha';
    h.getEl('jewelry-sale-broker-name').value = 'Broker Raj';
    h.getEl('jewelry-sale-final-price').value = '135000';
    h.getEl('jewelry-sale-date').value = '2026-10-30';
    h.getEl('jewelry-sale-notes').value = 'Settled directly';
    h.getEl('jewelry-sale-mfg-cost').dataset.mfgCost = '90000';
    h.getEl('jewelry-sale-replacement-cost').dataset.replacementCost = '98000';

    await h.JewelryMemoController.handleConfirmJewelrySale();

    assert.equal(DBManager.database.jewelrySales.length, 1, 'Strictly 1 canonical sale record exists (duplicate purged)');
    const sale = DBManager.database.jewelrySales[0];
    assert.equal(sale.id, 'jsale_piece_a');
    assert.equal(sale.memoId, 'jmemo_10', 'Auto-linked to open memo');
    assert.equal(sale.memoNumber, 'JM-010');
    assert.equal(sale.mfgProfit, 45000);
    assert.equal(sale.replacementProfit, 37000);
    assert.equal(sale.goldCommodityGain, 8000);

    const memoAfterSale = DBManager.database.jewelryMemos[0];
    assert.equal(memoAfterSale.items[0].status, 'sold', 'Open memo item automatically settled to sold');
    assert.equal(memoAfterSale.status, 'closed', 'Memo automatically closed when last open item sold');

    const itemAfterSale = DBManager.getItem('piece_a');
    assert.equal(itemAfterSale.status, 'Sold');
    assert.equal(itemAfterSale.sno, null);
    assert.equal(DBManager.getItem('piece_b').sno, 1, 'Remaining active stock resequenced to S.No 1');

    // 2B: Edit Existing Sale Price -> updates jewelrySales, items, AND jewelryMemos
    h.getEl('jewelry-sale-id').value = 'jsale_piece_a';
    h.getEl('jewelry-sale-final-price').value = '142000';
    await h.JewelryMemoController.handleConfirmJewelrySale();

    assert.equal(DBManager.database.jewelrySales[0].soldPrice, 142000);
    assert.equal(DBManager.getItem('piece_a').soldPrice, 142000);
    assert.equal(DBManager.database.jewelryMemos[0].items[0].soldPrice, 142000);

    // 2C: Return Sale -> restores piece to In Stock with explicit null fields, marks memo returned, cleans sales & indexes
    await h.JewelrySalesController.handleReturnSale(DBManager.database.jewelrySales[0]);
    await h.flushConfirms();

    assert.equal(DBManager.database.jewelrySales.length, 0, 'Sale record deleted');
    assert.equal(DBManager.getSaleByItemId('piece_a'), null, 'salesByItemId index cleaned');
    assert.equal(DBManager.getSaleBySku('MG-A1'), null, 'salesBySku index cleaned');

    const restoredItem = DBManager.getItem('piece_a');
    assert.equal(restoredItem.status, 'In Stock');
    assert.equal(restoredItem.soldPrice, null, 'Explicit null prevents Firestore ghost field resurrection');
    assert.equal(restoredItem.soldTo, null);
    assert.equal(restoredItem.issuedTo, null);
    assert.equal(restoredItem.issuedMemoNumber, null);
    assert.equal(restoredItem.activeMemoId, null);
    assert.equal(restoredItem.activeSaleId, null);
    assert.ok(restoredItem.sno >= 1, 'Restored item re-assigned contiguous active S.No');
    assert.equal(DBManager.database.jewelryMemos[0].items[0].status, 'returned');
  });

  await t.test('3. Bidirectional Lifecycle Healer Reconciles Duplicate Sales, Orphaned Memos, Zombie Sales & Stranded Items', async () => {
    const db = DBManager.database;

    db.items = [
      // Case A: Sold piece whose open memo was left unsettled & has 2 duplicate sales
      { id: 'p_sold', sku: 'MG-S1', name: 'Sold Necklace', status: 'Sold', updatedAt: '2026-10-28T10:00:00Z' },
      // Case B: Piece explicitly returned to In Stock AFTER an older zombie sale record
      { id: 'p_returned', sku: 'MG-R1', name: 'Returned Ring', status: 'In Stock', statusChangedAt: '2026-10-30T15:00:00Z', updatedAt: '2026-10-30T15:00:00Z' },
      // Case C: Piece whose catalog status was wiped to 'In Stock' even though an active open memo holds it
      { id: 'p_on_memo', sku: 'MG-M1', name: 'Memo Bracelet', status: 'In Stock', updatedAt: '2026-10-25T10:00:00Z' },
      // Case D: Stranded 'Issued' piece with NO open memo anywhere
      { id: 'p_stranded', sku: 'MG-ST1', name: 'Stranded Pendant', status: 'Issued', issuedTo: 'Ghost Client', issuedMemoNumber: 'JM-999' }
    ];

    db.jewelrySales = [
      { id: 'sale_random_old', itemId: 'p_sold', sku: 'MG-S1', soldPrice: 180000, updatedAt: '2026-10-28T09:00:00Z' },
      { id: 'jsale_p_sold', itemId: 'p_sold', sku: 'MG-S1', soldPrice: 185000, customerName: 'Buyer One', updatedAt: '2026-10-28T10:00:00Z' },
      { id: 'jsale_p_returned', itemId: 'p_returned', sku: 'MG-R1', soldPrice: 95000, saleDate: '2026-10-27', updatedAt: '2026-10-27T10:00:00Z' }
    ];

    db.jewelryMemos = [
      // Orphaned open memo for already-sold piece p_sold
      {
        id: 'jm_orphan',
        memoNumber: 'JM-101',
        status: 'open',
        items: [{ itemId: 'p_sold', sku: 'MG-S1', status: 'open', sellingPrice: 185000 }]
      },
      // Two conflicting open memos claiming p_on_memo -> newest should win
      {
        id: 'jm_older',
        memoNumber: 'JM-102',
        status: 'open',
        personName: 'Older Holder',
        updatedAt: '2026-10-26T10:00:00Z',
        items: [{ itemId: 'p_on_memo', sku: 'MG-M1', status: 'open', sellingPrice: 70000 }]
      },
      {
        id: 'jm_newer',
        memoNumber: 'JM-103',
        status: 'open',
        personName: 'Newer Holder',
        brokerName: 'Broker Z',
        updatedAt: '2026-10-29T10:00:00Z',
        items: [{ itemId: 'p_on_memo', sku: 'MG-M1', status: 'open', sellingPrice: 75000 }]
      }
    ];

    DBManager.healJewelryLifecycle(db);

    // Case A checks: duplicate sale removed, canonical kept, orphaned open memo settled & closed
    assert.equal(db.jewelrySales.filter(s => s.itemId === 'p_sold').length, 1, 'Duplicate sale deduplicated');
    assert.equal(db.jewelrySales.find(s => s.itemId === 'p_sold').id, 'jsale_p_sold');
    const orphanMemo = db.jewelryMemos.find(m => m.id === 'jm_orphan');
    assert.equal(orphanMemo.items[0].status, 'sold', 'Orphaned open memo item marked sold');
    assert.equal(orphanMemo.status, 'closed', 'Orphaned memo auto-closed');

    // Case B checks: zombie sale purged because item was returned after sale timestamp
    assert.equal(db.jewelrySales.find(s => s.itemId === 'p_returned'), undefined, 'Zombie sale purged');
    assert.equal(db.items.find(i => i.id === 'p_returned').status, 'In Stock');

    // Case C checks: conflicting open memos resolved in favor of newer memo, catalog item restored to Issued
    const olderMemo = db.jewelryMemos.find(m => m.id === 'jm_older');
    const newerMemo = db.jewelryMemos.find(m => m.id === 'jm_newer');
    assert.equal(olderMemo.items[0].status, 'returned', 'Older conflicting memo claim released');
    assert.equal(olderMemo.status, 'closed');
    assert.equal(newerMemo.items[0].status, 'open');
    const memoPiece = db.items.find(i => i.id === 'p_on_memo');
    assert.equal(memoPiece.status, 'Issued');
    assert.equal(memoPiece.issuedTo, 'Newer Holder');
    assert.equal(memoPiece.issuedMemoNumber, 'JM-103');

    // Case D checks: stranded Issued item with no open memo returned to In Stock
    const strandedPiece = db.items.find(i => i.id === 'p_stranded');
    assert.equal(strandedPiece.status, 'In Stock');
    assert.equal(strandedPiece.issuedTo, null);
    assert.equal(strandedPiece.issuedMemoNumber, null);
  });

  await t.test('4. Emerald & Loose Stone Conservation: Partial Memo Sync, Multi-Rate Sale History, Piece Conservation & Stone Delete', async () => {
    const h = createControllerHarness();
    global.window = h.windowStub;

    // 4A: Multi-size Emerald parcel exact piece & 3-decimal carat conservation (including pieces < sizes.length)
    const emerald = {
      id: 'em_lot_1',
      color: '7A',
      group: 'Zambian Lot',
      lustreGrade: 'AAA',
      pricePerCarat: 12000,
      weight: 10.000,
      pieces: 10,
      sizes: [
        { shape: 'Octagon', size: '6x4', pieces: 3, weight: 3.000 },
        { shape: 'Octagon', size: '7x5', pieces: 3, weight: 3.000 },
        { shape: 'Octagon', size: '8x6', pieces: 4, weight: 4.000 }
      ]
    };
    DBManager.database.emeralds = [emerald];
    DBManager.database.memos = [
      {
        id: 'ememo_1',
        memoNumber: 'M-001',
        brokerName: 'Johari Broker',
        date: '2026-10-25',
        status: 'open',
        saleRate: 15000,
        items: [
          {
            emeraldId: 'em_lot_1',
            carats: 5.000,
            pieces: 5,
            returnedCarats: 0,
            returnedPieces: 0,
            soldCarats: 0,
            soldPieces: 0,
            emeraldSnapshot: {
              color: '7A',
              group: 'Zambian Lot',
              lustreGrade: 'AAA',
              shape: 'Octagon',
              pricePerCarat: 12000
            }
          }
        ]
      }
    ];

    // Partial return of 1.000 ct / 1 pc (fewer pieces than sizes.length = 3!) via handleSaveMemoAction
    savedCalls = [];
    h.MemoController.activeActionContext = { memoId: 'ememo_1', itemIndex: 0, actionType: 'returned' };
    h.getEl('memo-action-carats').value = '1.000';
    h.getEl('memo-action-pieces').value = '1';
    await h.MemoController.handleSaveMemoAction();

    assert.ok(
      savedCalls.some(c => c.col === 'mava_catalog_emerald_memos' && c.id === 'ememo_1'),
      'Partial return persists open emerald memo to Firestore via DBManager.saveItem'
    );
    assert.equal(DBManager.database.memos[0].items[0].returnedCarats, 1.000);
    assert.equal(DBManager.database.memos[0].status, 'open');

    // Partial sale 1: 1.500 cts / 2 pcs @ ₹15,000/ct
    h.MemoController.activeActionContext = { memoId: 'ememo_1', itemIndex: 0, actionType: 'sold' };
    h.getEl('memo-action-carats').value = '1.500';
    h.getEl('memo-action-pieces').value = '2';
    await h.MemoController.handleSaveMemoAction();

    assert.equal(emerald.weight, 8.500, 'Exact 3-decimal carat deduction');
    const sumSizesAfterSale1 = emerald.sizes.reduce((s, r) => s + r.pieces, 0);
    const sumWeightAfterSale1 = Number(emerald.sizes.reduce((s, r) => s + r.weight, 0).toFixed(3));
    assert.equal(sumSizesAfterSale1, 8, 'Exact integer piece conservation (10 - 2 = 8, zero phantom pieces)');
    assert.equal(sumWeightAfterSale1, 8.500, 'Multi-size weights sum exactly to parcel weight');

    // Partial sale 2 at a different rate (₹20,000/ct) for remaining 2.500 cts / 2 pcs -> closes memo as partial-sale
    DBManager.database.memos[0].saleRate = 20000;
    h.MemoController.activeActionContext = { memoId: 'ememo_1', itemIndex: 0, actionType: 'sold' };
    h.getEl('memo-action-carats').value = '2.500';
    h.getEl('memo-action-pieces').value = '2';
    await h.MemoController.handleSaveMemoAction();

    assert.equal(emerald.weight, 6.000);
    assert.equal(emerald.sizes.reduce((s, r) => s + r.pieces, 0), 6);
    assert.equal(DBManager.database.memos[0].status, 'closed');
    assert.equal(DBManager.database.memos[0].outcomeType, 'partial-sale', 'Classified as partial-sale because 1.0ct was returned');

    // Verify SalesController.getSaleRecords sums multi-rate saleHistory accurately: (1.5 * 15000) + (2.5 * 20000) = 22500 + 50000 = 72500
    const emeraldSales = h.SalesController.getSaleRecords();
    assert.equal(emeraldSales.length, 1);
    assert.equal(emeraldSales[0].soldCts, 4.000);
    assert.equal(emeraldSales[0].saleValue, 72500, 'Multi-transaction saleHistory summed without single-rate overwrite');
    assert.equal(emeraldSales[0].outcomeType, 'partial-sale');

    // Simulate parcel deletion, then _restoreOrRecreateEmerald recreates from snapshot
    DBManager.database.emeralds = [];
    const recreated = h.MemoController._restoreOrRecreateEmerald(DBManager.database.memos[0].items[0], 4.000, 4);
    assert.ok(recreated, 'Recreates deleted emerald parcel on sale reversal');
    assert.equal(DBManager.database.emeralds.length, 1);
    assert.equal(DBManager.database.emeralds[0].weight, 4.000);
    assert.equal(DBManager.database.emeralds[0].pieces, 4);

    // 4B: Loose Stone multi-size deduction (verifying totalPcs is captured BEFORE loop mutation) & handleDeleteStone without TypeError
    const stonePacket = {
      id: 'st_pack_1',
      type: 'Diamond',
      color: 'D-10',
      group: 'Melee Lot',
      lustreGrade: 'VVS-EF',
      pricePerCarat: 45000,
      weight: 6.000,
      pieces: 12,
      sizes: [
        { shape: 'Round', mm: '1.5', pieces: 6, weight: 3.000 },
        { shape: 'Round', mm: '1.8', pieces: 6, weight: 3.000 }
      ]
    };
    DBManager.database.stones = [stonePacket];
    h.JewelStoneMemoController.deductStockFromStone(stonePacket, 2.000, 4);
    assert.equal(stonePacket.weight, 4.000);
    assert.equal(stonePacket.sizes.reduce((s, r) => s + r.pieces, 0), 8, 'Exact 12 - 4 = 8 pieces conserved across sizes');
    assert.equal(Number(stonePacket.sizes.reduce((s, r) => s + r.weight, 0).toFixed(3)), 4.000);

    // Delete loose stone packet -> executes cleanly with zero TypeError
    await h.StoneController.handleDeleteStone(stonePacket);
    await h.flushConfirms();
    assert.equal(DBManager.database.stones.length, 0, 'Stone packet cleanly deleted');

    // 4C: Alphanumeric Pudia natural sort ('2', '7', '7A', '7M', '10')
    const pudias = [{ color: '10' }, { color: '7M' }, { color: '2' }, { color: '7' }, { color: '7A' }];
    h.EmeraldController._sortEmeraldItems(pudias, '');
    assert.deepEqual(pudias.map(p => p.color), ['2', '7', '7A', '7M', '10']);
  });

  await t.test('5. CloudSync Fixes A, B, C, Persistent Offline Tombstones & Multi-Chunk :listen Stream Parser', async () => {
    // ── Fix A: isCorruptOrPhantom edge cases & future-proofing ──
    assert.equal(
      CloudSync.isCorruptOrPhantom({ id: 'em_zero', color: 0, group: 'Lot Zero', weight: 4.25 }, 'em_zero'),
      false,
      'Emerald with numeric color: 0 is valid'
    );
    assert.equal(
      CloudSync.isCorruptOrPhantom({ id: 'jm_mfg', manufacturerName: 'Jaipur Atelier', status: 'open', items: [{ sku: 'MG-1' }] }, 'jm_mfg'),
      false,
      'Memo with manufacturerName is valid'
    );
    assert.equal(
      CloudSync.isCorruptOrPhantom({ id: 'future_doc_1', docType: 'karigar_job', karigarId: 'K-1', goldIssuedGrams: 35.4 }, 'future_doc_1'),
      false,
      'Future domain document with >= 3 meaningful fields is preserved'
    );
    assert.equal(
      CloudSync.isCorruptOrPhantom({ id: 'piece_100', sku: 'MG-100', status: 'Reserved' }, 'piece_100'),
      true,
      'Historical unnamed test phantom piece_100 is still blocked'
    );

    // ── Fix B: Full 3-Way Field-Level Merge with localStorage Snapshots ──
    const baseDoc = {
      id: 'piece_3way',
      sku: 'MG-3WAY',
      name: 'Polki Necklace',
      labourCost: 25000,
      status: 'In Stock',
      issuedTo: null,
      issuedMemoNumber: null,
      image: 'data:image/jpeg;base64,' + 'A'.repeat(900),
      updatedAt: '2026-10-30T10:00:00.000Z'
    };
    CloudSync.saveDocSnapshot('piece_3way', baseDoc, 'mava_catalog_items');

    // Verify snapshot compacted large base64 image in localStorage
    const rawSnapJson = mockStorage.get(CloudSync.STORAGE_KEY_SNAPSHOTS);
    assert.ok(rawSnapJson && rawSnapJson.includes('[__b64_hash__:'), 'Compacts base64 strings inside localStorage snapshot');

    // Device A (local) updated labourCost; Device B (remote, 5s later) issued the piece on Memo JM-777
    const localEdited = {
      ...baseDoc,
      labourCost: 32000,
      updatedAt: '2026-10-30T10:05:00.000Z'
    };
    const remoteIssued = {
      ...baseDoc,
      status: 'Issued',
      issuedTo: 'Zaveri Jewels',
      issuedMemoNumber: 'JM-777',
      updatedAt: '2026-10-30T10:05:05.000Z'
    };

    const mergeRes = CloudSync.mergeArray([localEdited], [remoteIssued], 'id', new Set(), 'mava_catalog_items');
    assert.equal(mergeRes.merged.length, 1);
    assert.equal(mergeRes.merged[0].labourCost, 32000, '3-way merge preserved Device A local labourCost edit');
    assert.equal(mergeRes.merged[0].status, 'Issued', '3-way merge preserved Device B remote Memo issue status');
    assert.equal(mergeRes.merged[0].issuedTo, 'Zaveri Jewels');
    assert.equal(mergeRes.merged[0].issuedMemoNumber, 'JM-777');
    assert.equal(mergeRes.itemsToUpload.length, 1, 'Merged composite document is queued to push back to Firestore so both devices converge');

    // Key-order-independent _deepEqualIgnoringMeta ignores key order and _serverUpdateTime
    assert.equal(
      CloudSync._deepEqualIgnoringMeta(
        { a: 1, b: { x: 10, y: 20 }, _serverUpdateTime: '2026-10-30T01:00:00Z' },
        { b: { y: 20, x: 10 }, a: 1, _serverUpdateTime: '2026-10-30T09:00:00Z' }
      ),
      true
    );

    // ── Fix C: _fetchWithTimeout retries 429/503 and surfaces 401 auth errors ──
    const realFetchMethod = Object.getPrototypeOf(CloudSync)._fetchWithTimeout || CloudSync._fetchWithTimeout;
    const origGlobalFetch = global.fetch;
    let fetchAttemptCount = 0;
    let authErrorEvents = 0;
    global.window.dispatchEvent = (evt) => {
      if (evt && evt.type === 'mava:cloud-auth-error') authErrorEvents++;
    };

    try {
      global.fetch = async () => {
        fetchAttemptCount++;
        if (fetchAttemptCount === 1) {
          return { ok: false, status: 503, headers: { get: () => null } };
        }
        return { ok: true, status: 200, headers: { get: () => null } };
      };
      const retryResp = await realFetchMethod.call(CloudSync, 'https://example.com/v1/docs', { _retryDelayMs: 10 });
      assert.equal(retryResp.status, 200);
      assert.equal(fetchAttemptCount, 2, 'Automatically retried transient 503 once and succeeded');

      global.fetch = async () => ({ ok: false, status: 401, headers: { get: () => null } });
      const authResp = await realFetchMethod.call(CloudSync, 'https://example.com/v1/docs', { _retryDelayMs: 10 });
      assert.equal(authResp.status, 401);
      assert.equal(CloudSync.status, 'error', '401 sets CloudSync status to error (not offline)');
      assert.equal(authErrorEvents, 1, 'Dispatches mava:cloud-auth-error event on 401');
    } finally {
      global.fetch = origGlobalFetch;
    }

    // ── Persistent Offline Tombstones Prevent Resurrection Across Reload ──
    CloudSync.enqueueMutation('mava_catalog_items', 'deleted_offline_1', null, 'delete');
    const savedTombstonesRaw = mockStorage.get(CloudSync.STORAGE_KEY_TOMBSTONES);
    assert.ok(savedTombstonesRaw, 'Offline delete persisted to mava_offline_tombstones');

    // Simulate offline queue cleared or unflushed tombstone surviving app restart while remote still returns deleted_offline_1
    CloudSync.clearPendingQueue();
    CloudSync.recordRemoteDeletion = async () => false; // Tombstone flush still offline/deferred
    CloudSync.getDocument = async () => null;
    CloudSync.listDocuments = async (colName) => {
      if (colName === 'mava_catalog_items') {
        return [{ id: 'deleted_offline_1', sku: 'MG-GHOST', name: 'Ghost Ring', updatedAt: '2026-10-20T00:00:00Z' }];
      }
      return [];
    };

    const localDbForSync = {
      items: [],
      emeralds: [],
      stones: [],
      memos: [],
      jewelryMemos: [],
      jewelStoneMemos: [],
      jewelrySales: [],
      sales: [],
      stockLedger: [],
      settings: { currency: '₹' }
    };
    const syncRes = await CloudSync.syncAll(localDbForSync, { forceFull: true });
    assert.equal(syncRes.success, true);
    assert.equal(localDbForSync.items.length, 0, 'Persistent offline tombstone prevented deleted item resurrection');

    // ── Multi-Chunk Firestore REST :listen JSON Array Stream Parser ──
    const chunk1 = '[\r\n  {\r\n    "documentChange": {\r\n      "document": { "name": "projects/p/databases/(default)/documents/mava_catalog_items/i1", "fields": { "note": { "stringValue": "brace { inside } string" } } }\r\n    }\r\n  },\r\n  {\r\n    "targetCha';
    const chunk2 = 'nge": { "targetChangeType": "CURRENT" }\r\n  }\r\n]';

    const step1 = CloudSync._extractJsonObjectsFromBuffer(chunk1);
    assert.equal(step1.objects.length, 1, 'Extracted first complete multi-line object from chunk 1');
    assert.ok(step1.remaining.startsWith('{\r\n    "targetCha'), 'Preserved partial second object across chunk boundary');

    const step2 = CloudSync._extractJsonObjectsFromBuffer(step1.remaining + chunk2);
    assert.equal(step2.objects.length, 1, 'Completed second object when chunk 2 arrived');
    assert.equal(step2.objects[0].targetChange.targetChangeType, 'CURRENT');
    assert.equal(step2.remaining, '');
  });
});

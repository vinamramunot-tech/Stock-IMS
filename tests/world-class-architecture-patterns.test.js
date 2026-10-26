const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Mock localStorage for Node test runner environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const DBManager = require(path.join(__dirname, '../renderer/js/db-manager.js'));
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));
const Calc = require(path.join(__dirname, '../renderer/js/calc.js'));

global.DBManager = DBManager;
global.CloudSync = CloudSync;
global.Calc = Calc;

test('World-Class Architecture Patterns Suite (Pillars 1 to 6)', async (t) => {

  t.beforeEach(() => {
    mockStorage.clear();
    DBManager._subscribers = new Map();
    CloudSync.setDocument = async (col, id, data) => data;
    CloudSync.deleteDocument = async () => true;
    CloudSync.batchWrite = async () => ({ success: true, count: 0 });
    CloudSync._fetchWithTimeout = async () => ({ ok: true, status: 200, json: async () => ({}) });

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
      settings: { currency: '₹' }
    };
    DBManager._rebuildIndexes();
  });

  // =========================================================================
  // Pillar 1: Inventory Finite State Machine (FSM)
  // =========================================================================
  await t.test('Pillar 1: Inventory Finite State Machine (FSM) enforces state invariants', async () => {
    const FSM = DBManager.InventoryFSM;
    assert.ok(FSM, 'InventoryFSM exists on DBManager');

    // 1A: Check valid transitions
    assert.strictEqual(FSM.canTransition('In Stock', 'Issued'), true);
    assert.strictEqual(FSM.canTransition('In Stock', 'Sold'), true);
    assert.strictEqual(FSM.canTransition('In Stock', 'Reserved'), true);

    assert.strictEqual(FSM.canTransition('Issued', 'In Stock'), true);
    assert.strictEqual(FSM.canTransition('Issued', 'Sold'), true);

    assert.strictEqual(FSM.canTransition('Reserved', 'In Stock'), true);
    assert.strictEqual(FSM.canTransition('Reserved', 'Sold'), true);

    assert.strictEqual(FSM.canTransition('Sold', 'In Stock'), true); // Sale reversal

    // 1B: Block invalid / corrupted transitions
    assert.strictEqual(FSM.canTransition('Sold', 'Issued'), false, 'Sold item cannot directly be put on memo');
    assert.strictEqual(FSM.canTransition('Sold', 'Reserved'), false, 'Sold item cannot be reserved');
    assert.strictEqual(FSM.canTransition('In Stock', 'NonExistentStatus'), false);

    // 1C: State transition execution & invariant enforcement
    const testItem = { id: 'ring_101', sku: 'MG-R101', name: 'Diamond Solitaire', status: 'In Stock' };

    // Transition to Issued (on memo)
    const issuedItem = FSM.transitionItem(testItem, 'Issued', { memoId: 'memo_99' });
    assert.strictEqual(issuedItem.status, 'Issued');
    assert.ok(issuedItem.statusChangedAt, 'Stamps status timestamp');
    assert.ok(issuedItem.clientMutationId, 'Stamps mutation id');

    // Transition from Issued to Sold
    const soldItem = FSM.transitionItem(issuedItem, 'Sold', { salePrice: 125000, customerName: 'Royal Jewelers' });
    assert.strictEqual(soldItem.status, 'Sold');

    // Transition from Sold back to In Stock (Sale return)
    const reversedItem = FSM.transitionItem(soldItem, 'In Stock', { reason: 'Customer exchange' });
    assert.strictEqual(reversedItem.status, 'In Stock');

    // Block invalid transition attempt: Sold item cannot directly transition to Issued
    const immutableSoldPiece = { id: 'ring_102', sku: 'MG-R102', status: 'Sold' };
    assert.throws(() => {
      FSM.transitionItem(immutableSoldPiece, 'Issued');
    }, /Illegal inventory transition/);
  });

  // =========================================================================
  // Pillar 2: Normalized O(1) Entity Store & Secondary Indexes
  // =========================================================================
  await t.test('Pillar 2: Normalized O(1) Entity Store & Secondary Indexes provide fast lookups', async () => {
    // Populate DB with test records
    DBManager.database.items = [
      { id: 'item_101', sku: 'MG-101', name: 'Gold Necklace', status: 'In Stock' },
      { id: 'item_102', sku: 'MG-102', name: 'Emerald Choker', status: 'Issued' },
      { id: 'item_103', sku: 'MG-103', name: 'Polki Bracelet', status: 'Sold' }
    ];
    DBManager.database.jewelryMemos = [
      { id: 'memo_01', memoNumber: 'MEM-2026-001', customerName: 'Client Alpha', status: 'Open' }
    ];
    DBManager.database.jewelrySales = [
      { id: 'sale_01', itemId: 'item_103', sku: 'MG-103', finalSalePrice: 250000 }
    ];

    DBManager._rebuildIndexes();

    // 2A: O(1) Lookups by ID
    const item101 = DBManager.getItem('item_101');
    assert.ok(item101);
    assert.strictEqual(item101.name, 'Gold Necklace');

    // 2B: O(1) Case-insensitive lookups by SKU
    const itemBySku = DBManager.getItemBySku('  mg-102  ');
    assert.ok(itemBySku);
    assert.strictEqual(itemBySku.id, 'item_102');

    // 2C: O(1) Lookups by Status
    const inStockItems = DBManager.getItemsByStatus('In Stock');
    assert.strictEqual(inStockItems.length, 1);
    assert.strictEqual(inStockItems[0].id, 'item_101');

    const issuedItems = DBManager.getItemsByStatus('Issued');
    assert.strictEqual(issuedItems.length, 1);
    assert.strictEqual(issuedItems[0].id, 'item_102');

    // 2D: Memo and Sale Lookups
    const sale = DBManager.getSaleByItemId('item_103');
    assert.ok(sale);
    assert.strictEqual(sale.finalSalePrice, 250000);

    const memo = DBManager.getMemoByNumber('MEM-2026-001');
    assert.ok(memo);
    assert.strictEqual(memo.customerName, 'Client Alpha');

    // 2E: Dynamic Index Maintenance on CRUD mutations
    const newItem = { id: 'item_104', sku: 'MG-104', name: 'Ruby Bangle', status: 'In Stock' };
    DBManager.saveItem('items', newItem);
    assert.strictEqual(DBManager.getItem('item_104')?.name, 'Ruby Bangle');
    assert.strictEqual(DBManager.getItemBySku('MG-104')?.id, 'item_104');

    // Patch status
    DBManager.patchItem('items', 'item_104', { status: 'Sold' });
    assert.strictEqual(DBManager.getItem('item_104')?.status, 'Sold');
    assert.strictEqual(DBManager.getItemsByStatus('Sold').some(i => i.id === 'item_104'), true);

    // Delete item
    DBManager.deleteItem('items', 'item_104');
    assert.strictEqual(DBManager.getItem('item_104'), null);
    assert.strictEqual(DBManager.getItemBySku('MG-104'), null);
  });

  // =========================================================================
  // Pillar 3: Idempotent Client Mutations & Deterministic Keys
  // =========================================================================
  await t.test('Pillar 3: Idempotent Client Mutations & Deterministic Keys prevent duplicates', async () => {
    // 3A: Deterministic Idempotency Key Generator
    const key1 = DBManager.generateIdempotencyKey('sale_create', 'item_500', { price: 80000 });
    const key2 = DBManager.generateIdempotencyKey('sale_create', 'item_500', { price: 80000 });
    assert.strictEqual(key1, key2, 'Identical actions and entities produce deterministic identical keys');

    const keyDifferent = DBManager.generateIdempotencyKey('sale_create', 'item_501', { price: 80000 });
    assert.notStrictEqual(key1, keyDifferent, 'Different entities produce unique keys');

    // 3B: CloudSync mergeArray deduplication via clientMutationId
    const localArray = [
      { id: 'local_row_1', sku: 'MG-99', name: 'Emerald Ring', clientMutationId: 'mut_unique_abc', updatedAt: '2026-10-25T00:00:00Z' }
    ];

    // Remote contains identical mutation uploaded from phone with a generated remote id
    const remoteArray = [
      { id: 'remote_row_2', sku: 'MG-99', name: 'Emerald Ring (Updated on Phone)', clientMutationId: 'mut_unique_abc', updatedAt: '2026-10-25T00:05:00Z' }
    ];

    const { merged, itemsToUpload, updatedRemoteCount } = CloudSync.mergeArray(localArray, remoteArray, 'id');

    // Must merge into a single row instead of appending duplicate row
    assert.strictEqual(merged.length, 1, 'Deduplicates rows sharing same clientMutationId');
    assert.strictEqual(merged[0].name, 'Emerald Ring (Updated on Phone)', 'Applies remote update cleanly');
    assert.strictEqual(updatedRemoteCount, 1);
    assert.strictEqual(itemsToUpload.length, 0, 'Does not redundantly re-upload resolved mutation');
  });

  // =========================================================================
  // Pillar 4: Decoupled Binary Media & LQIP
  // =========================================================================
  await t.test('Pillar 4: Decoupled Binary Media isolates heavy base64 strings', async () => {
    assert.ok(typeof CloudSync.decoupleMedia === 'function', 'decoupleMedia exists on CloudSync');

    // Test item with heavy base64 image
    const heavyItem = {
      id: 'item_heavy_1',
      sku: 'MG-HEAVY',
      name: 'Diamond Necklace',
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      images: [
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
        'https://firebasestorage.googleapis.com/v0/b/mava-gems-ios.appspot.com/photo.jpg'
      ]
    };

    const decoupled = await CloudSync.decoupleMedia(heavyItem, 'jewelry');
    assert.ok(decoupled, 'Returns decoupled item');
    assert.strictEqual(decoupled.id, heavyItem.id);
    assert.ok(decoupled.image, 'Retains image reference');
    // Ensure existing remote URL is completely untouched
    assert.strictEqual(decoupled.images[1], 'https://firebasestorage.googleapis.com/v0/b/mava-gems-ios.appspot.com/photo.jpg');
  });

  // =========================================================================
  // Pillar 5: Reactive Event-Driven Pub/Sub Architecture
  // =========================================================================
  await t.test('Pillar 5: Reactive Event-Driven Pub/Sub notifies subscribers without tight coupling', async () => {
    const receivedEvents = [];

    const handleSaved = (data) => receivedEvents.push({ type: 'items:saved', data });
    const handleDeleted = (data) => receivedEvents.push({ type: 'items:deleted', data });

    DBManager.on('items:saved', handleSaved);
    DBManager.on('items:deleted', handleDeleted);

    // Save item triggers event
    const item = { id: 'item_pubsub_1', sku: 'MG-PS1', name: 'Sapphire Ring', status: 'In Stock' };
    DBManager.saveItem('items', item);

    assert.strictEqual(receivedEvents.length, 1);
    assert.strictEqual(receivedEvents[0].type, 'items:saved');
    assert.strictEqual(receivedEvents[0].data.id, 'item_pubsub_1');

    // Delete item triggers event
    DBManager.deleteItem('items', 'item_pubsub_1');
    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(receivedEvents[1].type, 'items:deleted');
    assert.strictEqual(receivedEvents[1].data.id, 'item_pubsub_1');

    // Unsubscribe (off) stops notification
    DBManager.off('items:saved', handleSaved);
    DBManager.saveItem('items', { id: 'item_pubsub_2', sku: 'MG-PS2' });
    assert.strictEqual(receivedEvents.length, 2, 'No new events fired for unsubscribed listener');
  });

  // =========================================================================
  // Pillar 6: Zero-Floating-Point Financial & Gemstone Arithmetic
  // =========================================================================
  await t.test('Pillar 6: Zero-Floating-Point Financial & Gemstone Arithmetic eliminates IEEE-754 drift', async () => {
    // 6A: Minor unit conversions
    assert.strictEqual(Calc.toPaise(1234.56), 123456);
    assert.strictEqual(Calc.fromPaise(123456), 1234.56);
    assert.strictEqual(Calc.toPaise('₹ 1,23,456.78'), 12345678);

    assert.strictEqual(Calc.toMillicarats(1.235), 1235);
    assert.strictEqual(Calc.fromMillicarats(1235), 1.235);

    assert.strictEqual(Calc.toMilligrams(15.420), 15420);
    assert.strictEqual(Calc.fromMilligrams(15420), 15.42);

    // 6B: Flawless currency arithmetic (Eradicating 0.1 + 0.2 = 0.30000000000000004)
    const floatDriftSum = 0.1 + 0.2;
    assert.notStrictEqual(floatDriftSum, 0.3, 'Standard JS float has precision drift');
    assert.strictEqual(Calc.addCurrency(0.1, 0.2), 0.30, 'Paise arithmetic gives exact 0.30');

    // Chained deductions
    const net = Calc.subtractCurrency(1000.00, 250.75, 149.25, 100.00);
    assert.strictEqual(net, 500.00);

    // Multiplication (e.g. 18% GST on ₹125.50)
    const gstTotal = Calc.multiplyCurrency(125.50, 1.18);
    assert.strictEqual(gstTotal, 148.09);

    // 6C: Conserved Gemstone Parcel Split
    // Original parcel: 10.000 carats, costing ₹1,00,000.
    // Split off 3.750 carats at rate ₹12,000/ct.
    const splitResult = Calc.calculateConservedParcelSplit(10.000, 100000, 3.750, 12000);
    assert.strictEqual(splitResult.splitCts, 3.750);
    assert.strictEqual(splitResult.splitValue, 45000); // 3.75 * 12,000 = 45,000
    assert.strictEqual(splitResult.remainingCts, 6.250);
    assert.strictEqual(splitResult.remainingCost, 55000); // 1,00,000 - 45,000 = 55,000
    // Total carats & financial valuation are 100% conserved
    assert.strictEqual(splitResult.splitCts + splitResult.remainingCts, 10.000);
    assert.strictEqual(splitResult.splitValue + splitResult.remainingCost, 100000);

    // 6D: Conserved Gemstone Lot Merge
    // Merging 3 parcels:
    // Parcel 1: 4.250 carats costing ₹42,500
    // Parcel 2: 3.750 carats costing ₹45,000
    // Parcel 3: 2.000 carats costing ₹20,000
    const mergeResult = Calc.calculateConservedLotMerge([
      { carats: 4.250, totalCost: 42500 },
      { carats: 3.750, totalCost: 45000 },
      { carats: 2.000, totalCost: 20000 }
    ]);

    assert.strictEqual(mergeResult.totalCarats, 10.000);
    assert.strictEqual(mergeResult.totalCost, 107500);
    assert.strictEqual(mergeResult.averageRatePerCarat, 10750);
    assert.strictEqual(mergeResult.parcelCount, 3);
  });

});

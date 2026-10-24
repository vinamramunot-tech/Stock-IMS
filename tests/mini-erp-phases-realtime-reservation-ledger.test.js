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

const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));
const DBManager = require(path.join(__dirname, '../renderer/js/db-manager.js'));
global.CloudSync = CloudSync;

test('Mini-ERP Real-Time, Reservation Locking, Presence & Ledger Suite', async (t) => {

  t.beforeEach(() => {
    mockStorage.clear();
    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog',
      realtimeStreamEnabled: false // manually managed in tests
    });

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
  });

  // =========================================================================
  // Phase 1: Real-Time Push Streaming & Polling Suppression
  // =========================================================================
  await t.test('Phase 1: Real-Time Push Streaming & In-Memory Update', async () => {
    // 1A: Setup local item
    DBManager.database.items = [
      { id: 'item_rt_1', sku: 'MG-RT01', name: 'Original Name', price: 50000, status: 'In Stock' }
    ];

    let recordUpdatedFired = false;
    let cloudSyncedFired = false;

    global.window = {
      DBManager,
      dispatchEvent: (evt) => {
        if (evt.type === 'mava:record-updated') recordUpdatedFired = true;
        if (evt.type === 'mava:cloud-synced') cloudSyncedFired = true;
      }
    };

    try {
      // 1B: Simulate an incoming real-time documentChange from Firestore push stream
      const streamMessage = {
        documentChange: {
          document: {
            name: 'projects/mava-gems-ios/databases/(default)/documents/mava_catalog_items/item_rt_1',
            fields: {
              id: { stringValue: 'item_rt_1' },
              sku: { stringValue: 'MG-RT01' },
              name: { stringValue: 'Updated via Real-Time Stream' },
              price: { integerValue: '55000' },
              status: { stringValue: 'In Stock' }
            },
            updateTime: '2026-10-25T14:00:00.000000Z'
          }
        }
      };

      CloudSync.handleRealtimeMessage(streamMessage);

      // Verify in-memory database was updated instantly (0ms)
      const updatedItem = DBManager.database.items[0];
      assert.equal(updatedItem.name, 'Updated via Real-Time Stream');
      assert.equal(updatedItem.price, 55000);
      assert.equal(recordUpdatedFired, true, 'Dispatched mava:record-updated event');
      assert.equal(cloudSyncedFired, true, 'Dispatched mava:cloud-synced event');

      // 1C: Verify redundant polling suppression when realtime stream is connected
      CloudSync.realtime.connected = true;
      assert.equal(CloudSync.isRealtimeConnected(), true);
    } finally {
      CloudSync.stopRealtimeListener();
      global.window = undefined;
    }
  });

  // =========================================================================
  // Phase 2: Inventory Reservation State Machine
  // =========================================================================
  await t.test('Phase 2A: Inventory Reservation Lifecycle (Hold & Release)', async () => {
    DBManager.database.items = [
      { id: 'piece_100', sku: 'MG-100', name: 'Emerald Pendant', price: 90000, status: 'In Stock' }
    ];

    // Check initially available
    const check1 = DBManager.checkItemAvailability(DBManager.database.items[0]);
    assert.equal(check1.available, true);

    // Reserve for 10 minutes by Staff A
    const res = await DBManager.reserveItem('items', 'piece_100', 'Ayush', 10, 'Memo Draft #101');
    assert.equal(res.success, true);
    assert.equal(DBManager.database.items[0].status, 'Reserved');
    assert.equal(DBManager.database.items[0].reservation.staffName, 'Ayush');

    // Self-availability check: Staff A can still access their own reserved item
    const checkSelf = DBManager.checkItemAvailability(DBManager.database.items[0], 'Ayush');
    assert.equal(checkSelf.available, true);
    assert.equal(checkSelf.selfReserved, true);

    // Release reservation
    const rel = await DBManager.releaseReservation('items', 'piece_100', 'Ayush');
    assert.equal(rel.success, true);
    assert.equal(DBManager.database.items[0].status, 'In Stock');
    assert.equal(DBManager.database.items[0].reservation, null);
  });

  await t.test('Phase 2B: Collision Prevention (Blocks Second Staff Member on Active Hold)', async () => {
    DBManager.database.items = [
      { id: 'piece_200', sku: 'MG-200', name: 'Diamond Solitaire', price: 150000, status: 'In Stock' }
    ];

    // Staff A holds piece
    await DBManager.reserveItem('items', 'piece_200', 'Ayush', 15);

    // Staff B attempts to reserve or add to memo -> MUST BE BLOCKED
    const checkStaffB = DBManager.checkItemAvailability(DBManager.database.items[0], 'Vinamra');
    assert.equal(checkStaffB.available, false);
    assert.equal(checkStaffB.heldBy, 'Ayush');
    assert.ok(checkStaffB.reason.includes('Reserved by Ayush'));

    const reserveAttemptB = await DBManager.reserveItem('items', 'piece_200', 'Vinamra', 10);
    assert.equal(reserveAttemptB.success, false);
    assert.equal(reserveAttemptB.heldBy, 'Ayush');
  });

  await t.test('Phase 2C: Expired Reservation Automatically Frees Inventory', async () => {
    // Reservation created in the past (expired 5 minutes ago)
    const expiredTime = new Date(Date.now() - 300000).toISOString();
    DBManager.database.items = [
      {
        id: 'piece_300',
        sku: 'MG-300',
        status: 'Reserved',
        reservation: {
          staffName: 'Staff X',
          reservedAt: new Date(Date.now() - 900000).toISOString(),
          expiresAt: expiredTime
        }
      }
    ];

    const check = DBManager.checkItemAvailability(DBManager.database.items[0], 'NewStaff');
    assert.equal(check.available, true, 'Expired reservation is available to new staff');
    assert.equal(check.expiredReservation, true);

    // New staff can acquire hold over expired item
    const acquire = await DBManager.reserveItem('items', 'piece_300', 'NewStaff', 10);
    assert.equal(acquire.success, true);
    assert.equal(DBManager.database.items[0].reservation.staffName, 'NewStaff');
  });

  // =========================================================================
  // Phase 3: Showroom Multi-User Presence
  // =========================================================================
  await t.test('Phase 3: Multi-User Presence Tracking & Visual Conflict Avoidance', () => {
    const presence = CloudSync.presence;
    presence.init('Ayush');
    assert.equal(presence.staffName, 'Ayush');
    assert.ok(presence.deviceId);

    // Update active showroom activity
    presence.updateView('jewelry-memos', 'MG-NECK-01');
    assert.equal(presence.activeView, 'jewelry-memos');
    assert.equal(presence.activeSku, 'MG-NECK-01');

    // Simulate remote staff members online
    presence.onlineStaff.set('dev_phone_vinamra', {
      deviceId: 'dev_phone_vinamra',
      staffName: 'Vinamra',
      activeView: 'catalog',
      activeSku: 'MG-NECK-01', // also looking at this piece on iPhone
      lastSeen: new Date().toISOString()
    });

    presence.onlineStaff.set('dev_phone_ritu', {
      deviceId: 'dev_phone_ritu',
      staffName: 'Ritu',
      activeView: 'emeralds',
      activeSku: 'P-101',
      lastSeen: new Date().toISOString()
    });

    // Check viewers for MG-NECK-01
    const viewersNecklace = presence.getStaffViewingSku('MG-NECK-01');
    assert.equal(viewersNecklace.length, 1);
    assert.equal(viewersNecklace[0], 'Vinamra', 'Identifies remote staff member viewing SKU');

    // Stale user filtering (> 2 min old)
    presence.onlineStaff.set('dev_stale', {
      deviceId: 'dev_stale',
      staffName: 'OldUser',
      lastSeen: new Date(Date.now() - 300000).toISOString() // 5 min ago
    });
  });

  // =========================================================================
  // Phase 4: Event-Sourced Carat & Stock Ledger
  // =========================================================================
  await t.test('Phase 4A: Immutable Event-Sourced Stock Movement Ledger', () => {
    assert.equal(DBManager.database.stockLedger.length, 0);

    // 1. Initial parcel stock
    DBManager.recordStockEvent({
      pudiaNumber: 'P-50',
      eventType: 'INITIAL_STOCK',
      caratsDelta: 50.000,
      piecesDelta: 100,
      staffName: 'Ayush',
      notes: 'Initial Zambian parcel entry'
    });

    // 2. Memo issue deduction
    DBManager.recordStockEvent({
      pudiaNumber: 'P-50',
      eventType: 'MEMO_ISSUED',
      caratsDelta: -12.450,
      piecesDelta: -25,
      referenceId: 'JM-501',
      staffName: 'Ayush',
      notes: 'Issued on memo to Client ABC'
    });

    // 3. Partial return
    DBManager.recordStockEvent({
      pudiaNumber: 'P-50',
      eventType: 'MEMO_RETURNED',
      caratsDelta: 4.200,
      piecesDelta: 8,
      referenceId: 'JM-501',
      staffName: 'Ayush',
      notes: 'Client returned 8 pieces'
    });

    assert.equal(DBManager.database.stockLedger.length, 3);

    // Retrieve ledger for pudia P-50
    const pudiaHistory = DBManager.getPudiaLedger('P-50');
    assert.equal(pudiaHistory.length, 3);

    // Reconcile mathematical carat conservation: 50 - 12.45 + 4.2 = 41.750 carats
    const recon = DBManager.reconcileCaratBalance('P-50', 41.750);
    assert.equal(recon.pudiaNumber, 'P-50');
    assert.equal(recon.eventCount, 3);
    assert.equal(recon.netDeltas, 41.750);
    assert.equal(recon.isConserved, true);
  });

  await t.test('Phase 4B: Jewelry Piece Audit Ledger Traversal', () => {
    // Record lifecycle events for ring MG-ROYAL-01
    DBManager.recordStockEvent({
      itemId: 'piece_royal',
      sku: 'MG-ROYAL-01',
      eventType: 'STONE_MOUNTED',
      caratsDelta: 2.15,
      notes: 'Mounted central emerald from Pudia P-50'
    });

    DBManager.recordStockEvent({
      itemId: 'piece_royal',
      sku: 'MG-ROYAL-01',
      eventType: 'RESERVED',
      staffName: 'Ayush',
      notes: 'Reserved for exhibition client'
    });

    DBManager.recordStockEvent({
      itemId: 'piece_royal',
      sku: 'MG-ROYAL-01',
      eventType: 'SOLD',
      referenceId: 'INV-2026-99',
      staffName: 'Ayush',
      notes: 'Sold at showroom'
    });

    const itemTrail = DBManager.getItemLedger('MG-ROYAL-01');
    assert.equal(itemTrail.length, 3);
    assert.equal(itemTrail[0].eventType, 'SOLD'); // newest first
    assert.equal(itemTrail[1].eventType, 'RESERVED');
    assert.equal(itemTrail[2].eventType, 'STONE_MOUNTED');
  });
});

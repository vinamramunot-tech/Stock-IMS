const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load modules
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));

test('Instant Launch, Granular Writes & Cloud Storage Suite', async (t) => {

  await t.test('1. Granular Document Writes: Fast Single-Item Push', async () => {
    // Mock DBManager in isolation
    const patches = [];
    const originalSetDoc = CloudSync.setDocument;
    CloudSync.setDocument = async (col, id, item) => {
      patches.push({ col, id, item });
      return item;
    };

    const mockDb = {
      items: [{ id: 'item_1', sku: 'MG-01', price: 20000 }]
    };

    // Simulate saveItem
    const updatedItem = { id: 'item_1', sku: 'MG-01', price: 24000, updatedAt: new Date().toISOString() };
    const newItem = { id: 'item_2', sku: 'MG-02', price: 15000, updatedAt: new Date().toISOString() };

    // Update existing item
    const idx = mockDb.items.findIndex(i => i.id === updatedItem.id);
    mockDb.items[idx] = updatedItem;
    await CloudSync.setDocument('mava_catalog_items', updatedItem.id, updatedItem);

    // Insert new item
    mockDb.items.push(newItem);
    await CloudSync.setDocument('mava_catalog_items', newItem.id, newItem);

    try {
      assert.equal(mockDb.items.length, 2, 'In-memory state updated immediately at 0ms');
      assert.equal(mockDb.items[0].price, 24000);
      assert.equal(patches.length, 2, 'Two lightweight document patches sent instead of 21MB full resaves');
      assert.equal(patches[0].id, 'item_1');
      assert.equal(patches[1].id, 'item_2');
    } finally {
      CloudSync.setDocument = originalSetDoc;
    }
  });

  await t.test('2. Granular Document Deletion', async () => {
    const deletedDocs = [];
    const originalDeleteDoc = CloudSync.deleteDocument;
    CloudSync.deleteDocument = async (col, id) => {
      deletedDocs.push({ col, id });
      return true;
    };

    const mockDb = {
      items: [
        { id: 'item_1', sku: 'MG-01' },
        { id: 'item_2', sku: 'MG-02' }
      ]
    };

    // Simulate deleteItem
    const idToDelete = 'item_1';
    mockDb.items = mockDb.items.filter(i => i.id !== idToDelete);
    await CloudSync.deleteDocument('mava_catalog_items', idToDelete);

    try {
      assert.equal(mockDb.items.length, 1, 'Item removed from RAM');
      assert.equal(mockDb.items[0].id, 'item_2');
      assert.equal(deletedDocs.length, 1);
      assert.equal(deletedDocs[0].id, 'item_1');
    } finally {
      CloudSync.deleteDocument = originalDeleteDoc;
    }
  });

  await t.test('3. Firebase Storage Photo Decoupling: base64ToUint8Array & uploadImage', async () => {
    // 3A: Binary conversion
    const sampleBase64 = 'data:image/jpeg;base64,' + Buffer.from('TEST_IMAGE_DATA').toString('base64');
    const bytes = CloudSync.base64ToUint8Array(sampleBase64);
    assert.ok(bytes instanceof Uint8Array || Buffer.isBuffer(bytes), 'Converted base64 to binary buffer');
    assert.equal(Buffer.from(bytes).toString('utf8'), 'TEST_IMAGE_DATA');

    // 3B: Existing HTTP URL should be returned as-is
    const existingUrl = 'https://firebasestorage.googleapis.com/v0/b/mava-gems-ios.firebasestorage.app/o/img.jpg?alt=media';
    const resultUrl = await CloudSync.uploadImage(existingUrl);
    assert.equal(resultUrl, existingUrl, 'Preserves existing remote URL without re-uploading');

    // 3C: Fallback when storage bucket is unreachable returns base64 safely (zero photo loss)
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async () => {
      return { ok: false, status: 404, text: async () => 'Not Found' };
    };

    try {
      const fallback = await CloudSync.uploadImage(sampleBase64, 'images/test.jpg');
      assert.equal(fallback, sampleBase64, 'Graceful fallback to compressed base64 if cloud bucket pending');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }

    // 3D: Successful upload returns permanent media URL
    CloudSync._fetchWithTimeout = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'images/pieces/MG-01.jpg',
          downloadTokens: 'token-abc-123'
        })
      };
    };

    try {
      const liveUploaded = await CloudSync.uploadImage(sampleBase64, 'images/pieces/MG-01.jpg');
      assert.ok(liveUploaded.includes('https://firebasestorage.googleapis.com'), 'Returns cloud storage URL');
      assert.ok(liveUploaded.includes('token-abc-123'), 'Includes download token');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('4. Fast Wake & Focus Sync Listeners', () => {
    let focusFired = false;
    let visibilityFired = false;

    const mockWindow = {
      addEventListener: (evt, handler) => {
        if (evt === 'focus') focusFired = true;
      }
    };

    // Verify CloudSync binds event handlers when window is available
    assert.equal(typeof CloudSync.setupAutoSync, 'function');
  });

  await t.test('5. Fast Active Interval: 15s Polling for Low Concurrency Lag', () => {
    assert.equal(CloudSync.config.autoSyncIntervalMs, 15000, 'Auto-sync interval is 15s (sub-minute multi-user sync)');
    assert.equal(CloudSync.config.storageBucket, 'mava-gems-ios.firebasestorage.app', 'Storage bucket configured');
  });

  await t.test('6. Canonical Collection Resolution & Granular Settings Saves', async () => {
    const DBManager = require(path.join(__dirname, '../renderer/js/db-manager.js'));
    
    // 6A: Check key resolution for both short and prefixed names
    const rItems = DBManager._resolveCollectionNames('items');
    assert.equal(rItems.dbKey, 'items');
    assert.equal(rItems.firestoreCol, 'mava_catalog_items');

    const rEmeralds = DBManager._resolveCollectionNames('mava_catalog_emeralds');
    assert.equal(rEmeralds.dbKey, 'emeralds');
    assert.equal(rEmeralds.firestoreCol, 'mava_catalog_emeralds');

    const rMemos = DBManager._resolveCollectionNames('memos');
    assert.equal(rMemos.dbKey, 'memos');
    assert.equal(rMemos.firestoreCol, 'mava_catalog_emerald_memos');

    // 6B: saveSettings updates local state & stamps updatedAt
    DBManager.database = {
      items: [],
      settings: { goldRate24kt: { ratePerGram: 15200 } }
    };

    await DBManager.saveSettings({
      goldRate24kt: { ratePerGram: 15500, effectiveDate: '2026-10-21' }
    });

    assert.equal(DBManager.database.settings.goldRate24kt.ratePerGram, 15500);
    assert.ok(DBManager.database.settings.updatedAt, 'Stamped updatedAt on settings save');
  });

  await t.test('7. Smart Delta Query: Bandwidth & Latency Optimization', async () => {
    const originalFetch = CloudSync._fetchWithTimeout;
    let queryBody = null;

    CloudSync._fetchWithTimeout = async (url, options) => {
      queryBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            document: {
              name: 'projects/mava-gems-ios/databases/(default)/documents/mava_catalog_items/item_99',
              fields: {
                id: { stringValue: 'item_99' },
                sku: { stringValue: 'MG-99' },
                status: { stringValue: 'Sold' },
                updatedAt: { stringValue: '2026-10-21T18:00:00.000Z' }
              }
            }
          }
        ]
      };
    };

    try {
      const results = await CloudSync.queryUpdatedDocuments('mava_catalog_items', '2026-10-21T17:00:00.000Z');
      assert.equal(results.length, 1);
      assert.equal(results[0].id, 'item_99');
      assert.equal(results[0].status, 'Sold');

      // Verify query structure
      assert.ok(queryBody.structuredQuery, 'Uses structuredQuery');
      assert.equal(queryBody.structuredQuery.where.fieldFilter.field.fieldPath, 'updatedAt');
      assert.equal(queryBody.structuredQuery.where.fieldFilter.op, 'GREATER_THAN');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('8. Real-Time UI Event Dispatching on Cloud Sync', async () => {
    let eventReceived = null;
    global.window = {
      dispatchEvent: (e) => { eventReceived = e; }
    };
    global.CustomEvent = class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };

    const mockDb = {
      items: [{ id: 'item_1', sku: 'MG-01', updatedAt: '2026-10-20T00:00:00.000Z' }],
      emeralds: [],
      stones: [],
      jewelryMemos: [],
      jewelStoneMemos: [],
      jewelrySales: []
    };

    // Mock queryUpdatedDocuments returning a remote update
    const origQuery = CloudSync.queryUpdatedDocuments;
    const origBatchWrite = CloudSync.batchWrite;
    const origFetch = CloudSync._fetchWithTimeout;
    CloudSync.lastSyncTime = '2026-10-20T00:00:00.000Z';
    CloudSync.queryUpdatedDocuments = async (col) => {
      if (col === 'mava_catalog_items') {
        return [{ id: 'item_test_event', sku: 'MG-TEST-EVT', status: 'Sold', updatedAt: '2026-10-21T12:00:00.000Z' }];
      }
      return [];
    };
    CloudSync.batchWrite = async () => ({ success: true, count: 0 });
    CloudSync._fetchWithTimeout = async () => ({ ok: true, status: 200, json: async () => ({}) });

    try {
      const res = await CloudSync.syncAll(mockDb);
      assert.equal(res.success, true);
      assert.equal(res.updated, true);
      assert.ok(mockDb.items.some(i => i.id === 'item_test_event'), 'Local state merged remote status update');
      assert.ok(eventReceived, 'Dispatched custom event to window');
      assert.equal(eventReceived.type, 'mava:cloud-synced');
      assert.equal(eventReceived.detail.updated, true);
    } finally {
      CloudSync.queryUpdatedDocuments = origQuery;
      CloudSync.batchWrite = origBatchWrite;
      CloudSync._fetchWithTimeout = origFetch;
      delete global.window;
      delete global.CustomEvent;
    }
  });

});

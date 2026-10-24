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

test('Firestore Concurrency Control & Spark Quota Optimization Suite', async (t) => {

  t.beforeEach(() => {
    mockStorage.clear();
    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog',
      autoSyncIntervalMs: 15000,
      idleSyncIntervalMs: 60000,
      idleThresholdMs: 120000
    });
    CloudSync.lastSyncTime = null;
    CloudSync.syncInProgress = false;
    CloudSync._syncPending = false;
  });

  await t.test('1. Granular Field Patching via updateMask.fieldPaths', async () => {
    const interceptedRequests = [];
    const originalFetch = CloudSync._fetchWithTimeout;

    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      interceptedRequests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/mava-gems-ios/databases/(default)/documents/mava_catalog_items/item_01',
          fields: {
            status: { stringValue: 'On Memo' },
            memoId: { stringValue: 'MEMO-101' }
          },
          updateTime: '2026-10-25T10:00:00.000000Z'
        })
      };
    };

    try {
      const fullItem = {
        id: 'item_01',
        sku: 'MG-RING-01',
        name: 'Emerald Solitaire Ring',
        status: 'On Memo',
        memoId: 'MEMO-101',
        price: 85000,
        goldWeight: 4.5
      };

      // Patch ONLY status and memoId
      const res = await CloudSync.setDocument('mava_catalog_items', 'item_01', fullItem, {
        fieldPaths: ['status', 'memoId']
      });

      assert.equal(interceptedRequests.length, 1);
      const req = interceptedRequests[0];

      // Assert updateMask.fieldPaths query parameters are properly formed
      assert.ok(req.url.includes('updateMask.fieldPaths=status'), 'URL contains status fieldPath');
      assert.ok(req.url.includes('updateMask.fieldPaths=memoId'), 'URL contains memoId fieldPath');

      // Assert body payload contains ONLY the masked fields, not the unmasked fields
      assert.ok(req.body.fields.status, 'Payload contains status');
      assert.ok(req.body.fields.memoId, 'Payload contains memoId');
      assert.equal(req.body.fields.sku, undefined, 'Payload omits unmasked sku');
      assert.equal(req.body.fields.price, undefined, 'Payload omits unmasked price');

      // Assert server updateTime is captured
      assert.equal(res._serverUpdateTime, '2026-10-25T10:00:00.000000Z');
      assert.equal(fullItem._serverUpdateTime, '2026-10-25T10:00:00.000000Z');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('2. Optimistic Concurrency Control (OCC) with Precondition Query Parameter', async () => {
    const interceptedUrls = [];
    const originalFetch = CloudSync._fetchWithTimeout;

    CloudSync._fetchWithTimeout = async (url) => {
      interceptedUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: 'doc',
          fields: {},
          updateTime: '2026-10-25T10:05:00.000000Z'
        })
      };
    };

    try {
      const item = { id: 'item_02', sku: 'MG-02', price: 50000 };
      const preconditionTime = '2026-10-25T09:00:00.000000Z';

      await CloudSync.setDocument('mava_catalog_items', 'item_02', item, {
        precondition: { updateTime: preconditionTime }
      });

      const itemPatch = interceptedUrls.find(u => u.includes('mava_catalog_items'));
      assert.ok(itemPatch, 'Found PATCH request to mava_catalog_items');
      assert.ok(
        itemPatch.includes(`currentDocument.updateTime=${encodeURIComponent(preconditionTime)}`),
        'URL attaches currentDocument.updateTime precondition'
      );
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('3. OCC 412 Conflict Detection, Safe Automatic Field Merge, and Retry', async () => {
    let callCount = 0;
    const requestedUrls = [];
    const originalFetch = CloudSync._fetchWithTimeout;

    // Remote document existing on Firestore (e.g. modified on mobile phone)
    const remoteDocOnCloud = {
      name: 'projects/mava-gems-ios/databases/(default)/documents/mava_catalog_items/item_conflict',
      fields: {
        id: { stringValue: 'item_conflict' },
        sku: { stringValue: 'MG-CONF-01' },
        status: { stringValue: 'On Memo' }, // Mobile changed status to On Memo
        memoNumber: { stringValue: 'JM-888' },
        price: { integerValue: '60000' }
      },
      updateTime: '2026-10-25T11:00:00.000000Z'
    };

    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      requestedUrls.push({ url, method: options.method || 'GET' });
      callCount++;

      // When checking mava_catalog_items
      if (url.includes('mava_catalog_items')) {
        const itemCalls = requestedUrls.filter(r => r.url.includes('mava_catalog_items'));
        if (itemCalls.length === 1) {
          // First attempt: Stale precondition -> returns 412 Precondition Failed
          return {
            ok: false,
            status: 412,
            text: async () => 'Precondition Failed: document updateTime mismatch'
          };
        }
        if (itemCalls.length === 2) {
          // Second call: getDocument to fetch current remote version
          return {
            ok: true,
            status: 200,
            json: async () => remoteDocOnCloud
          };
        }
        if (itemCalls.length === 3) {
          // Third call: Retried write with fresh precondition and merged payload
          return {
            ok: true,
            status: 200,
            json: async () => ({
              name: remoteDocOnCloud.name,
              fields: {
                ...remoteDocOnCloud.fields,
                price: { integerValue: '65000' }
              },
              updateTime: '2026-10-25T11:01:00.000000Z'
            })
          };
        }
      }

      // Default for background deletion cleanup or other calls
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      // Desktop user edited price to 65000, while mobile changed status to On Memo
      const localEdit = {
        id: 'item_conflict',
        sku: 'MG-CONF-01',
        price: 65000
      };

      const result = await CloudSync.setDocument('mava_catalog_items', 'item_conflict', localEdit, {
        precondition: { updateTime: '2026-10-25T10:00:00.000000Z' }
      });

      const itemRequests = requestedUrls.filter(r => r.url.includes('/mava_catalog_items/'));
      assert.equal(itemRequests.length, 3, 'Executed 3-stage 412 recovery sequence (PATCH 412 -> GET -> PATCH 200)');
      assert.equal(itemRequests[0].method, 'PATCH');
      assert.equal(itemRequests[1].method, 'GET');
      assert.equal(itemRequests[2].method, 'PATCH');

      // Assert retry used the fresh updateTime from the fetched remote doc
      assert.ok(
        itemRequests[2].url.includes(`currentDocument.updateTime=${encodeURIComponent('2026-10-25T11:00:00.000000Z')}`),
        'Retry attaches fresh server updateTime precondition'
      );

      // Assert merged result preserves both mobile update (status) and desktop update (price)
      assert.equal(result.status, 'On Memo', 'Preserved remote status update');
      assert.equal(result.price, 65000, 'Preserved local price update');
      assert.equal(result._serverUpdateTime, '2026-10-25T11:01:00.000000Z');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('4. Write Deduplication: Directly Synced Items are NOT Re-Uploaded in Delta Sync', async () => {
    const uploadedBatchOps = [];
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async (ops) => {
      uploadedBatchOps.push(...ops);
      return { success: true, count: ops.length };
    };

    const originalQueryUpdated = CloudSync.queryUpdatedDocuments;
    CloudSync.queryUpdatedDocuments = async () => [];

    const originalGetDoc = CloudSync.getDocument;
    CloudSync.getDocument = async () => null;

    try {
      const t0 = '2026-10-25T10:00:00.000Z';
      CloudSync.lastSyncTime = t0;

      const t1 = '2026-10-25T10:05:00.000Z';
      const itemDirectlySynced = { id: 'item_direct', sku: 'MG-DIR', updatedAt: t1 };
      const itemNotYetSynced = { id: 'item_unpushed', sku: 'MG-UNP', updatedAt: t1 };

      // Simulate item_direct was ALREADY successfully pushed via setDocument
      CloudSync.recordSyncedDoc('mava_catalog_items', 'item_direct', t1);

      assert.equal(CloudSync.isAlreadySynced('mava_catalog_items', 'item_direct', t1), true);
      assert.equal(CloudSync.isAlreadySynced('mava_catalog_items', 'item_unpushed', t1), false);

      const mockDb = {
        items: [itemDirectlySynced, itemNotYetSynced],
        emeralds: [],
        stones: [],
        memos: [],
        jewelryMemos: [],
        jewelStoneMemos: [],
        jewelrySales: [],
        sales: []
      };

      // Trigger syncAll
      const res = await CloudSync.syncAll(mockDb);
      assert.equal(res.success, true);

      // Assert item_unpushed was uploaded, but item_direct was DEDUPLICATED and skipped!
      assert.ok(uploadedBatchOps.some(op => op.id === 'item_unpushed'), 'Unpushed item uploaded');
      assert.ok(!uploadedBatchOps.some(op => op.id === 'item_direct'), 'Directly synced item skipped (deduplicated)');
    } finally {
      CloudSync.batchWrite = originalBatchWrite;
      CloudSync.queryUpdatedDocuments = originalQueryUpdated;
      CloudSync.getDocument = originalGetDoc;
    }
  });

  await t.test('5. Adaptive Idle Detection & Activity Wake', () => {
    // Fresh state with activity just now
    CloudSync.recordActivity();
    assert.equal(CloudSync.isIdle(), false, 'App is initially active');

    // Simulate 3 minutes of idle inactivity
    CloudSync._lastUserActivity = Date.now() - 180000;
    assert.equal(CloudSync.isIdle(), true, 'App is flagged idle after threshold');

    // Simulate user interaction waking the app
    let syncQueued = false;
    const origQueueSync = CloudSync.queueSync;
    CloudSync.queueSync = () => { syncQueued = true; };

    try {
      CloudSync.recordActivity();
      assert.equal(CloudSync.isIdle(), false, 'App wakes to active state on user interaction');
      assert.equal(syncQueued, true, 'Instantly queues sync upon waking from idle');
    } finally {
      CloudSync.queueSync = origQueueSync;
    }
  });

  await t.test('6. DBManager.patchItem: Performs Granular Field Patch with updateMask and Precondition', async () => {
    let capturedOptions = null;
    let capturedCol = null;
    let capturedId = null;

    global.CloudSync = CloudSync;
    const origSetDoc = CloudSync.setDocument;
    CloudSync.setDocument = async (col, id, data, opts) => {
      capturedCol = col;
      capturedId = id;
      capturedOptions = opts;
      return {
        ...data,
        _serverUpdateTime: '2026-10-25T12:00:00.000Z'
      };
    };

    // Setup DBManager with in-memory item
    DBManager.database = {
      items: [
        {
          id: 'piece_99',
          sku: 'MG-P99',
          name: 'Diamond Studs',
          status: 'In Stock',
          price: 45000,
          _serverUpdateTime: '2026-10-25T11:00:00.000Z'
        }
      ]
    };

    try {
      // Patch only status to 'Sold'
      const success = await DBManager.patchItem('items', 'piece_99', { status: 'Sold' });
      assert.equal(success, true);

      // Verify in-memory state updated
      const inMemoryItem = DBManager.database.items[0];
      assert.equal(inMemoryItem.status, 'Sold');
      assert.equal(inMemoryItem.price, 45000, 'Unmodified fields intact');

      // Verify CloudSync was called with fieldPaths and precondition
      assert.equal(capturedCol, 'mava_catalog_items');
      assert.equal(capturedId, 'piece_99');
      assert.ok(capturedOptions.fieldPaths.includes('status'), 'updateMask includes status');
      assert.ok(capturedOptions.fieldPaths.includes('updatedAt'), 'updateMask includes updatedAt');
      assert.equal(capturedOptions.precondition.updateTime, '2026-10-25T11:00:00.000Z', 'Precondition passed');
    } finally {
      CloudSync.setDocument = origSetDoc;
    }
  });
});

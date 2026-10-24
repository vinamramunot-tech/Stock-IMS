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

test('Cross-Device Data Sync & Storage Pushes Test Suite', async (t) => {

  t.beforeEach(() => {
    mockStorage.clear();
    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog'
    });
    CloudSync.lastSyncTime = null;
    CloudSync.syncInProgress = false;
    CloudSync._syncPending = false;
  });

  await t.test('1. Bidirectional Delta Sync: Local items modified after lastSyncTime are uploaded', async () => {
    const uploadedOps = [];
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async (ops) => {
      uploadedOps.push(...ops);
      return { success: true, count: ops.length };
    };

    const originalQueryUpdated = CloudSync.queryUpdatedDocuments;
    CloudSync.queryUpdatedDocuments = async (col, since) => {
      return []; // No remote changes
    };

    const originalGetDoc = CloudSync.getDocument;
    CloudSync.getDocument = async () => null;

    try {
      // Simulate sync already performed at T0
      const t0 = new Date('2026-10-23T10:00:00Z').toISOString();
      CloudSync.lastSyncTime = t0;

      // Device A creates a memo and updates a jewelry piece at T1 (after T0)
      const t1 = new Date('2026-10-23T10:05:00Z').toISOString();
      const localDb = {
        settings: { currency: '₹' },
        items: [
          { id: 'item_1', sku: 'MG-01', status: 'Issued', updatedAt: t1 },
          { id: 'item_old', sku: 'MG-OLD', status: 'In Stock', updatedAt: '2026-10-23T09:00:00Z' }
        ],
        emeralds: [],
        stones: [],
        memos: [],
        jewelryMemos: [
          { id: 'jm_1', memoNumber: 'JM-001', personName: 'Client A', status: 'open', updatedAt: t1 }
        ],
        jewelStoneMemos: [],
        jewelrySales: []
      };

      const result = await CloudSync.syncAll(localDb);
      assert.equal(result.success, true);

      // Verify that ONLY items modified after t0 were included in delta upload
      assert.ok(uploadedOps.some(op => op.id === 'item_1' && op.collection === 'mava_catalog_items'), 'item_1 delta uploaded');
      assert.ok(uploadedOps.some(op => op.id === 'jm_1' && op.collection === 'mava_catalog_jewelry_memos'), 'jm_1 delta uploaded');
      assert.ok(!uploadedOps.some(op => op.id === 'item_old'), 'Unchanged item_old was NOT re-uploaded');
    } finally {
      CloudSync.batchWrite = originalBatchWrite;
      CloudSync.queryUpdatedDocuments = originalQueryUpdated;
      CloudSync.getDocument = originalGetDoc;
    }
  });

  await t.test('2. Remote Memo & Catalog Sync to Device B', async () => {
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async () => ({ success: true, count: 0 });

    const originalQueryUpdated = CloudSync.queryUpdatedDocuments;
    CloudSync.queryUpdatedDocuments = async (col, since) => {
      if (col === 'mava_catalog_jewelry_memos') {
        return [
          {
            id: 'jm_new',
            memoNumber: 'JM-999',
            personName: 'Ritu Munot',
            status: 'open',
            totalValue: 500000,
            updatedAt: '2026-10-23T11:00:00Z'
          }
        ];
      }
      if (col === 'mava_catalog_items') {
        return [
          {
            id: 'item_100',
            sku: 'EAR-99',
            status: 'Issued',
            issuedTo: 'Ritu Munot',
            issuedMemoNumber: 'JM-999',
            updatedAt: '2026-10-23T11:00:00Z'
          }
        ];
      }
      return [];
    };

    const originalGetDoc = CloudSync.getDocument;
    CloudSync.getDocument = async () => null;

    try {
      CloudSync.lastSyncTime = '2026-10-23T10:00:00Z';
      const deviceBDb = {
        settings: { currency: '₹' },
        items: [
          { id: 'item_100', sku: 'EAR-99', status: 'In Stock', updatedAt: '2026-10-23T09:00:00Z' }
        ],
        emeralds: [],
        stones: [],
        memos: [],
        jewelryMemos: [],
        jewelStoneMemos: [],
        jewelrySales: []
      };

      const result = await CloudSync.syncAll(deviceBDb);
      assert.equal(result.success, true);
      assert.equal(result.updated, true, 'Flagged that updates were applied');

      // Assert Device B has the new memo and updated item status
      assert.equal(deviceBDb.jewelryMemos.length, 1);
      assert.equal(deviceBDb.jewelryMemos[0].memoNumber, 'JM-999');
      assert.equal(deviceBDb.items[0].status, 'Issued');
      assert.equal(deviceBDb.items[0].issuedTo, 'Ritu Munot');
    } finally {
      CloudSync.batchWrite = originalBatchWrite;
      CloudSync.queryUpdatedDocuments = originalQueryUpdated;
      CloudSync.getDocument = originalGetDoc;
    }
  });

  await t.test('3. Deletion Sync Across Devices: Deleted Memos & Pieces are Purged', async () => {
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async () => ({ success: true, count: 0 });

    const originalQueryUpdated = CloudSync.queryUpdatedDocuments;
    CloudSync.queryUpdatedDocuments = async (col, since) => {
      if (col === 'mava_catalog_deletions') {
        return [
          {
            collection: 'mava_catalog_jewelry_memos',
            docId: 'memo_deleted_1',
            updatedAt: '2026-10-23T12:00:00Z'
          },
          {
            collection: 'mava_catalog_items',
            docId: 'item_deleted_2',
            updatedAt: '2026-10-23T12:00:00Z'
          }
        ];
      }
      return [];
    };

    const originalGetDoc = CloudSync.getDocument;
    CloudSync.getDocument = async () => null;

    try {
      CloudSync.lastSyncTime = '2026-10-23T11:00:00Z';
      const deviceBDb = {
        settings: { currency: '₹' },
        items: [
          { id: 'item_deleted_2', sku: 'DEL-02', updatedAt: '2026-10-23T10:00:00Z' },
          { id: 'item_keep', sku: 'KEEP-01', updatedAt: '2026-10-23T10:00:00Z' }
        ],
        emeralds: [],
        stones: [],
        memos: [],
        jewelryMemos: [
          { id: 'memo_deleted_1', memoNumber: 'JM-001', updatedAt: '2026-10-23T10:00:00Z' }
        ],
        jewelStoneMemos: [],
        jewelrySales: []
      };

      const result = await CloudSync.syncAll(deviceBDb);
      assert.equal(result.success, true);
      assert.equal(result.updated, true);

      // Verify deleted memo and piece were removed from Device B's database
      assert.equal(deviceBDb.jewelryMemos.length, 0, 'Deleted memo purged from Device B');
      assert.equal(deviceBDb.items.length, 1, 'Deleted item purged from Device B');
      assert.equal(deviceBDb.items[0].id, 'item_keep');
    } finally {
      CloudSync.batchWrite = originalBatchWrite;
      CloudSync.queryUpdatedDocuments = originalQueryUpdated;
      CloudSync.getDocument = originalGetDoc;
    }
  });

  await t.test('4. Emerald Memos Collection Included in Sync', async () => {
    const uploadedOps = [];
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async (ops) => {
      uploadedOps.push(...ops);
      return { success: true, count: ops.length };
    };

    const originalQueryUpdated = CloudSync.queryUpdatedDocuments;
    CloudSync.queryUpdatedDocuments = async () => [];
    const originalGetDoc = CloudSync.getDocument;
    CloudSync.getDocument = async () => null;

    try {
      CloudSync.lastSyncTime = '2026-10-23T08:00:00Z';
      const now = new Date('2026-10-23T13:00:00Z').toISOString();

      const localDb = {
        settings: { currency: '₹' },
        items: [],
        emeralds: [],
        stones: [],
        memos: [
          { id: 'em_memo_1', memoNumber: 'EM-101', brokerName: 'Gem Broker', totalCarats: 15.5, updatedAt: now }
        ],
        jewelryMemos: [],
        jewelStoneMemos: [],
        jewelrySales: []
      };

      const result = await CloudSync.syncAll(localDb);
      assert.equal(result.success, true);

      assert.ok(
        uploadedOps.some(op => op.id === 'em_memo_1' && op.collection === 'mava_catalog_emerald_memos'),
        'Emerald memo is synced to mava_catalog_emerald_memos collection'
      );
    } finally {
      CloudSync.batchWrite = originalBatchWrite;
      CloudSync.queryUpdatedDocuments = originalQueryUpdated;
      CloudSync.getDocument = originalGetDoc;
    }
  });

  await t.test('5. Deletion Record helper functions', async () => {
    const postedRequests = [];
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      postedRequests.push({ url, method: options.method, body: options.body });
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      await CloudSync.deleteDocument('mava_catalog_jewelry_memos', 'memo_test_123');
      assert.ok(postedRequests.length >= 2, 'Executed DELETE on doc and PATCH on deletions collection');
      assert.equal(postedRequests[0].method, 'DELETE');
      assert.ok(postedRequests[0].url.includes('mava_catalog_jewelry_memos/memo_test_123'));
      assert.equal(postedRequests[1].method, 'PATCH');
      assert.ok(postedRequests[1].url.includes('mava_catalog_deletions/mava_catalog_jewelry_memos__memo_test_123'));
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('6. batchWrite Seamless 403 Fallback to Concurrent setDocument/deleteDocument', async () => {
    const executedOps = [];
    const origSet = CloudSync.setDocument;
    const origDel = CloudSync.deleteDocument;
    const origFetch = CloudSync._fetchWithTimeout;

    // Simulate 403 PERMISSION_DENIED on batchWrite REST endpoint
    CloudSync._fetchWithTimeout = async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: "Missing or insufficient permissions." } })
    });

    CloudSync.setDocument = async (col, id, data) => {
      executedOps.push({ type: 'set', col, id, data });
      return data;
    };
    CloudSync.deleteDocument = async (col, id) => {
      executedOps.push({ type: 'delete', col, id });
      return true;
    };

    try {
      CloudSync._batchWriteForbidden = false;
      const ops = [
        { collection: 'mava_catalog_items', id: 'it_1', op: 'set', data: { name: 'Gold Ring' } },
        { collection: 'mava_catalog_items', id: 'it_2', op: 'delete' },
        { collection: 'mava_catalog_jewelry_memos', id: 'jm_1', op: 'set', data: { memoNumber: 'JM-001' } }
      ];

      const res = await CloudSync.batchWrite(ops);
      assert.equal(res.success, true);
      assert.equal(res.count, 3);
      assert.equal(executedOps.length, 3, 'All 3 operations were executed via individual permitted document endpoints');
      assert.equal(executedOps[0].type, 'set');
      assert.equal(executedOps[0].id, 'it_1');
      assert.equal(executedOps[1].type, 'delete');
      assert.equal(executedOps[1].id, 'it_2');
      assert.equal(executedOps[2].type, 'set');
      assert.equal(executedOps[2].id, 'jm_1');
      assert.equal(CloudSync._batchWriteForbidden, true, 'Cached _batchWriteForbidden for subsequent fast writes');
    } finally {
      CloudSync.setDocument = origSet;
      CloudSync.deleteDocument = origDel;
      CloudSync._fetchWithTimeout = origFetch;
      CloudSync._batchWriteForbidden = false;
    }
  });

  await t.test('7. DBManager.saveItem Always Refreshes updatedAt Timestamp', async () => {
    const DBManager = require(path.join(__dirname, '../renderer/js/db-manager.js'));
    DBManager.database = {
      items: [{ id: 'piece_101', sku: 'SKU-101', updatedAt: '2026-10-01T00:00:00.000Z' }]
    };

    const itemToUpdate = DBManager.database.items[0];
    const oldTimestamp = itemToUpdate.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise(r => setTimeout(r, 10));
    await DBManager.saveItem('mava_catalog_items', itemToUpdate);

    assert.notEqual(itemToUpdate.updatedAt, oldTimestamp, 'updatedAt was refreshed to current time');
    assert.ok(new Date(itemToUpdate.updatedAt).getTime() > new Date(oldTimestamp).getTime(), 'New updatedAt is strictly newer');
  });

  await t.test('8. Full Reconciliation & mergeArray: Remote Updates on Existing Memos are Applied Even When Array Lengths Match', async () => {
    const t1 = '2026-10-23T10:00:00.000Z';
    const t2 = '2026-10-23T12:00:00.000Z';

    const localDb = {
      settings: { currency: '₹' },
      items: [],
      emeralds: [],
      stones: [],
      memos: [],
      jewelryMemos: [
        { id: 'memo_004', memoNumber: 'JM-004', personName: 'Bangalore', status: 'open', updatedAt: t1 }
      ],
      jewelStoneMemos: [],
      jewelrySales: []
    };

    const originalListDocs = CloudSync.listDocuments;
    const originalBatchWrite = CloudSync.batchWrite;
    CloudSync.batchWrite = async () => ({ success: true, count: 0 });
    CloudSync.listDocuments = async (col) => {
      if (col === 'mava_catalog_jewelry_memos') {
        return [
          { id: 'memo_004', memoNumber: 'JM-004', personName: 'Bangalore', status: 'closed', updatedAt: t2 }
        ];
      }
      return [];
    };

    try {
      const result = await CloudSync.syncAll(localDb, { forceFull: true });
      assert.equal(result.success, true);
      assert.equal(result.updated, true, 'Updated flag is true when remote memo has newer timestamp');
      assert.equal(localDb.jewelryMemos.length, 1);
      assert.equal(localDb.jewelryMemos[0].status, 'closed', 'Local memo adopted remote status update');
      assert.equal(localDb.jewelryMemos[0].updatedAt, t2, 'Local memo adopted remote updatedAt timestamp');
    } finally {
      CloudSync.listDocuments = originalListDocs;
      CloudSync.batchWrite = originalBatchWrite;
    }
  });

});



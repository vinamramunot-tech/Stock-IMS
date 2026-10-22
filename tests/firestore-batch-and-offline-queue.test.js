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

test('Firestore Atomic Batch Writes & Offline Queue Suite', async (t) => {

  t.beforeEach(() => {
    mockStorage.clear();
    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog'
    });
  });

  await t.test('1. Document Path Resolution & batchWrite Payload Formatting', async () => {
    const docPath = CloudSync.getDocumentPath('mava_catalog_items', 'item_999');
    assert.equal(
      docPath,
      'projects/mava-gems-ios/databases/(default)/documents/mava_catalog_items/item_999',
      'Constructs canonical Firestore document path'
    );
  });

  await t.test('2. Single-Request Atomic batchWrite Execution', async () => {
    const postedRequests = [];
    const originalFetch = CloudSync._fetchWithTimeout;

    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      postedRequests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          writeResults: [
            { updateTime: '2026-10-22T10:00:00Z' },
            { updateTime: '2026-10-22T10:00:01Z' },
            { updateTime: '2026-10-22T10:00:02Z' }
          ]
        })
      };
    };

    try {
      const ops = [
        { collection: 'mava_catalog_items', id: 'i1', op: 'set', data: { sku: 'MG-01', price: 20000 } },
        { collection: 'mava_catalog_items', id: 'i2', op: 'set', data: { sku: 'MG-02', price: 35000 } },
        { collection: 'mava_catalog_items', id: 'i3', op: 'delete' }
      ];

      const res = await CloudSync.batchWrite(ops);
      assert.equal(res.success, true);
      assert.equal(res.count, 3, 'Committed 3 operations');
      assert.equal(postedRequests.length, 1, 'Executed in exactly 1 single atomic HTTP call');

      const req = postedRequests[0];
      assert.ok(req.url.includes(':batchWrite'), 'Hits Firestore batchWrite endpoint');
      assert.equal(req.body.writes.length, 3);
      assert.ok(req.body.writes[0].update, 'First operation is an update/set');
      assert.ok(req.body.writes[1].update, 'Second operation is an update/set');
      assert.ok(req.body.writes[2].delete, 'Third operation is a delete');
      assert.ok(req.body.writes[2].delete.endsWith('i3'));
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('3. Persistent Offline Write-Ahead Queue (Enqueue, Deduplicate, Persist)', () => {
    assert.equal(CloudSync.getPendingQueueCount(), 0);

    // Enqueue first mutation
    CloudSync.enqueueMutation('mava_catalog_items', 'item_101', { sku: 'MG-101', price: 50000 }, 'set');
    assert.equal(CloudSync.getPendingQueueCount(), 1);

    // Enqueue second distinct mutation
    CloudSync.enqueueMutation('mava_catalog_emeralds', 'em_202', { pudiaNo: 'P-202', carats: 12.5 }, 'set');
    assert.equal(CloudSync.getPendingQueueCount(), 2);

    // Deduplicate/Update existing mutation in queue
    CloudSync.enqueueMutation('mava_catalog_items', 'item_101', { sku: 'MG-101', price: 55000 }, 'set');
    assert.equal(CloudSync.getPendingQueueCount(), 2, 'Maintains deduplicated queue count');

    const queue = CloudSync.getPendingQueue();
    const item101 = queue.find(q => q.id === 'item_101');
    assert.equal(item101.data.price, 55000, 'Overwrites with latest mutation value');

    // Verify localStorage persistence
    const rawSaved = mockStorage.get(CloudSync.STORAGE_KEY_QUEUE);
    assert.ok(rawSaved, 'Queue is written to localStorage');
    const parsed = JSON.parse(rawSaved);
    assert.equal(parsed.length, 2);
  });

  await t.test('4. Automatic Offline Fallback: setDocument and deleteDocument Queue On Network Loss', async () => {
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async () => {
      throw new Error('TypeError: Failed to fetch (Offline in tunnel)');
    };

    try {
      // 4A: setDocument should not throw; should queue mutation and update status to offline
      const testItem = { id: 'offline_piece_1', sku: 'MG-OFF-01', price: 99000 };
      const saved = await CloudSync.setDocument('mava_catalog_items', 'offline_piece_1', testItem);
      assert.equal(saved.id, 'offline_piece_1', 'Returns item optimistically');
      assert.equal(CloudSync.status, 'offline');
      assert.equal(CloudSync.getPendingQueueCount(), 1);

      // 4B: deleteDocument should queue deletion
      const deleted = await CloudSync.deleteDocument('mava_catalog_items', 'item_to_remove');
      assert.equal(deleted, true);
      assert.equal(CloudSync.getPendingQueueCount(), 2);

      const queue = CloudSync.getPendingQueue();
      assert.equal(queue[1].op, 'delete');
      assert.equal(queue[1].id, 'item_to_remove');
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('5. Reconnection Drain: drainPendingQueue Commits via batchWrite & Clears Queue', async () => {
    // Populate queue with pending changes
    CloudSync.enqueueMutation('mava_catalog_items', 'i1', { sku: 'MG-01', price: 100 }, 'set');
    CloudSync.enqueueMutation('mava_catalog_items', 'i2', null, 'delete');
    assert.equal(CloudSync.getPendingQueueCount(), 2);

    const batchCalls = [];
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      batchCalls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          writeResults: [{ updateTime: '2026-10-22T10:00:00Z' }, { updateTime: '2026-10-22T10:00:01Z' }]
        })
      };
    };

    try {
      const drainResult = await CloudSync.drainPendingQueue();
      assert.equal(drainResult.success, true);
      assert.equal(drainResult.drained, 2);
      assert.equal(CloudSync.getPendingQueueCount(), 0, 'Queue is cleanly drained and cleared');
      assert.equal(batchCalls.length, 1);
      assert.equal(batchCalls[0].writes.length, 2);
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('6. Automatic Chunking of Large Batches (> 500 writes)', async () => {
    const batchCalls = [];
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      batchCalls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ writeResults: [] })
      };
    };

    try {
      // Create 550 operations (Firestore batch limit is 500)
      const ops = [];
      for (let i = 0; i < 550; i++) {
        ops.push({ collection: 'mava_catalog_items', id: `piece_${i}`, op: 'set', data: { idx: i } });
      }

      const res = await CloudSync.batchWrite(ops);
      assert.equal(res.success, true);
      assert.equal(batchCalls.length, 2, 'Chunks into 2 requests (500 + 50)');
      assert.equal(batchCalls[0].writes.length, 500);
      assert.equal(batchCalls[1].writes.length, 50);
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

  await t.test('7. Real-Time Latency Diagnostic Tracking', async () => {
    const originalFetch = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async () => {
      // Simulate 45ms network response
      await new Promise(r => setTimeout(r, 45));
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const ping = await CloudSync.measureLatency();
      assert.equal(ping.ok, true);
      assert.ok(ping.latencyMs >= 40, 'Measured round-trip latency');
      assert.equal(CloudSync.lastSyncLatencyMs, ping.latencyMs);
    } finally {
      CloudSync._fetchWithTimeout = originalFetch;
    }
  });

});

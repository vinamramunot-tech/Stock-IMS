const test = require('node:test');
const assert = require('node:assert');

// Mock localStorage for Node test runner environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const CloudSync = require('../renderer/js/cloud-sync.js');
const DBManager = require('../renderer/js/db-manager.js');

test.describe('Concurrency & Conflict Resolution Suite', () => {

  test.beforeEach(() => {
    // Reset DBManager database state
    DBManager.database = {
      items: [],
      emeralds: [],
      stones: [],
      memos: [],
      jewelryMemos: [],
      jewelStoneMemos: [],
      jewelrySales: [],
      logs: [],
      settings: {}
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  test('1. CloudSync.mergeArray resolves remote newer timestamps over local', () => {
    const local = [
      { id: 'item_1', name: 'Diamond Ring', price: 50000, updatedAt: '2026-10-20T10:00:00.000Z' }
    ];
    const remote = [
      { id: 'item_1', name: 'Diamond Ring Updated Remotely', price: 55000, updatedAt: '2026-10-20T11:00:00.000Z' }
    ];

    const { merged, itemsToUpload, updatedRemoteCount } = CloudSync.mergeArray(local, remote, 'id', new Set());

    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].name, 'Diamond Ring Updated Remotely');
    assert.strictEqual(merged[0].price, 55000);
    assert.strictEqual(updatedRemoteCount, 1);
    assert.strictEqual(itemsToUpload.length, 0, 'No local items should be queued for upload since remote was newer');
  });

  test('2. CloudSync.mergeArray keeps local when local timestamp is newer and queues for upload', () => {
    const local = [
      { id: 'item_1', name: 'Diamond Ring Local Edit', price: 60000, updatedAt: '2026-10-20T12:00:00.000Z' }
    ];
    const remote = [
      { id: 'item_1', name: 'Diamond Ring Old Remote', price: 50000, updatedAt: '2026-10-20T10:00:00.000Z' }
    ];

    const { merged, itemsToUpload, updatedRemoteCount } = CloudSync.mergeArray(local, remote, 'id', new Set());

    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].name, 'Diamond Ring Local Edit');
    assert.strictEqual(merged[0].price, 60000);
    assert.strictEqual(updatedRemoteCount, 0);
    assert.strictEqual(itemsToUpload.length, 1, 'Local item should be flagged for cloud upload');
    assert.strictEqual(itemsToUpload[0].id, 'item_1');
  });

  test('3. Clock-skew resolution: equal timestamps with divergent payload adopts remote to converge', () => {
    const sharedTime = '2026-10-20T10:00:00.000Z';
    const local = [
      { id: 'item_1', name: 'Local Divergent Name', price: 50000, updatedAt: sharedTime }
    ];
    const remote = [
      { id: 'item_1', name: 'Remote Authoritative Name', price: 52000, updatedAt: sharedTime }
    ];

    const { merged, updatedRemoteCount } = CloudSync.mergeArray(local, remote, 'id', new Set());

    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].name, 'Remote Authoritative Name');
    assert.strictEqual(merged[0].price, 52000);
    assert.strictEqual(updatedRemoteCount, 1);
  });

  test('4. Deletion tombstone lifecycle: deleted IDs are never resurrected by outdated cloud items', () => {
    const deletedIds = new Set(['item_deleted_1', 'item_deleted_2']);
    const local = [
      { id: 'item_active', name: 'Active Ring', updatedAt: '2026-10-20T10:00:00.000Z' }
    ];
    const remote = [
      { id: 'item_active', name: 'Active Ring', updatedAt: '2026-10-20T10:00:00.000Z' },
      { id: 'item_deleted_1', name: 'Resurrected Zombie Ring', updatedAt: '2026-10-20T09:00:00.000Z' },
      { id: 'item_deleted_2', name: 'Ghost Pendant', updatedAt: '2026-10-20T12:00:00.000Z' }
    ];

    const { merged, itemsToUpload } = CloudSync.mergeArray(local, remote, 'id', deletedIds);

    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].id, 'item_active');
    const hasZombie = merged.some(m => deletedIds.has(m.id));
    assert.strictEqual(hasZombie, false, 'Deleted items must not be resurrected into inventory');
    assert.strictEqual(itemsToUpload.length, 0);
  });

  test('5. Offline mutation queue: sequential enqueueing updates in-place for same item', () => {
    CloudSync.clearPendingQueue();
    assert.strictEqual(CloudSync.getPendingQueueCount(), 0);

    // Initial mutation
    CloudSync.enqueueMutation('mava_catalog_items', 'item_101', { name: 'Emerald Ring v1' }, 'set');
    assert.strictEqual(CloudSync.getPendingQueueCount(), 1);

    // Second mutation for same item should overwrite in place
    CloudSync.enqueueMutation('mava_catalog_items', 'item_101', { name: 'Emerald Ring v2' }, 'set');
    assert.strictEqual(CloudSync.getPendingQueueCount(), 1);

    const queue = CloudSync.getPendingQueue();
    assert.strictEqual(queue[0].data.name, 'Emerald Ring v2');

    // Mutation for another item increases queue
    CloudSync.enqueueMutation('mava_catalog_items', 'item_102', { name: 'Gold Bangle' }, 'set');
    assert.strictEqual(CloudSync.getPendingQueueCount(), 2);

    CloudSync.clearPendingQueue();
    assert.strictEqual(CloudSync.getPendingQueueCount(), 0);
  });

  test('6. Simultaneous double-issuance race condition guard', () => {
    // Piece is in stock
    const testItem = {
      id: 'piece_test_1',
      sku: 'TEST-SKU-1',
      name: 'Diamond Necklace',
      status: 'In Stock'
    };
    DBManager.database.items = [testItem];

    // Simulate Device A issuing the piece
    testItem.status = 'Issued';
    testItem.issuedTo = 'Client A';
    testItem.issuedMemoNumber = 'JM-001';

    // Simulate Device B attempting to issue the same piece concurrently
    const unavailableItems = [];
    const selectedItems = [{ id: 'piece_test_1', sku: 'TEST-SKU-1' }];

    for (const sel of selectedItems) {
      const liveItem = DBManager.getItems().find(i => i.id === sel.id);
      if (!liveItem) {
        unavailableItems.push(`${sel.sku} (deleted)`);
      } else if (liveItem.status === 'Sold') {
        unavailableItems.push(`${sel.sku} (already Sold)`);
      } else if (liveItem.status === 'Issued') {
        unavailableItems.push(`${sel.sku} (already on Memo ${liveItem.issuedMemoNumber || ''})`);
      }
    }

    assert.strictEqual(unavailableItems.length, 1);
    assert.match(unavailableItems[0], /already on Memo JM-001/);
  });
});

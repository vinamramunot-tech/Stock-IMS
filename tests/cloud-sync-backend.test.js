const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load CloudSync module
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));

test('Cloud Sync & Backend Call Verification Suite', async (t) => {

  await t.test('1. Firestore Document Value Serialization & Deserialization (Lossless Preservation)', () => {
    const complexJewelryItem = {
      id: 'item_test_001',
      sku: 'MG-RING-2026',
      name: 'Emerald & Diamond Halo Ring',
      status: 'In Stock',
      category: 'Rings',
      grossWeight: 5.45,
      netWeight: 4.80,
      goldRate: 7500,
      mfgCostPrice: 42000,
      marketCostPrice: 46500,
      multiplier: 1.25,
      sellingPrice: 58125,
      multiplierBasis: 'mfgCostPrice',
      hasEmeralds: true,
      notes: null,
      stones: [
        { type: 'Diamond', shape: 'Round', pieces: 18, weight: 0.45, rate: 35000 },
        { type: 'Emerald', shape: 'Oval', pieces: 1, weight: 0.65, rate: 45000 }
      ],
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T12:30:00.000Z'
    };

    // Serialize to Firestore Document format
    const doc = CloudSync.objectToFirestoreDocument(complexJewelryItem);
    assert.ok(doc && doc.fields, 'Document has fields wrapper');
    assert.equal(doc.fields.sku.stringValue, 'MG-RING-2026');
    assert.equal(doc.fields.hasEmeralds.booleanValue, true);
    assert.equal(doc.fields.notes.nullValue, null);
    assert.ok(doc.fields.stones.arrayValue, 'Nested stones array preserved');
    assert.equal(doc.fields.stones.arrayValue.values.length, 2);

    // Deserialize back from Firestore format
    const restored = CloudSync.firestoreDocumentToObject(doc);

    // Assert exact fidelity across all fields
    assert.equal(restored.id, complexJewelryItem.id);
    assert.equal(restored.sku, complexJewelryItem.sku);
    assert.equal(restored.name, complexJewelryItem.name);
    assert.equal(restored.grossWeight, complexJewelryItem.grossWeight);
    assert.equal(restored.multiplier, complexJewelryItem.multiplier);
    assert.equal(restored.sellingPrice, complexJewelryItem.sellingPrice);
    assert.equal(restored.hasEmeralds, true);
    assert.equal(restored.notes, null);
    assert.equal(restored.stones.length, 2);
    assert.equal(restored.stones[0].type, 'Diamond');
    assert.equal(restored.stones[0].pieces, 18);
    assert.equal(restored.stones[1].weight, 0.65);
    assert.equal(restored.updatedAt, complexJewelryItem.updatedAt);
  });

  await t.test('2. Backend REST URL and Key Configuration', () => {
    CloudSync.init({
      projectId: 'mava-gems-ios',
      apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
      databaseId: '(default)',
      collectionPrefix: 'mava_catalog'
    });

    const baseUrl = CloudSync.getBaseUrl();
    assert.equal(
      baseUrl,
      'https://firestore.googleapis.com/v1/projects/mava-gems-ios/databases/(default)/documents'
    );
    assert.equal(CloudSync.config.projectId, 'mava-gems-ios');
    assert.equal(CloudSync.config.apiKey, 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc');
  });

  await t.test('3. Backend REST API Mock Calls (setDocument, getDocument, listDocuments)', async () => {
    const mockStorage = new Map();

    // Mock internal fetch to simulate Firestore REST API responses
    const originalFetchWithTimeout = CloudSync._fetchWithTimeout;
    CloudSync._fetchWithTimeout = async (url, options = {}) => {
      const method = options.method || 'GET';
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/documents/')[1]?.split('/') || [];
      const collection = pathParts[0];
      const docId = pathParts[1];

      if (method === 'PATCH') {
        const body = JSON.parse(options.body);
        mockStorage.set(`${collection}/${docId}`, body);
        return {
          ok: true,
          status: 200,
          json: async () => body
        };
      }

      if (method === 'GET' && docId) {
        const item = mockStorage.get(`${collection}/${docId}`);
        if (!item) {
          return { ok: false, status: 404, text: async () => 'Not Found' };
        }
        return {
          ok: true,
          status: 200,
          json: async () => item
        };
      }

      if (method === 'GET' && !docId) {
        const docs = [];
        for (const [key, val] of mockStorage.entries()) {
          if (key.startsWith(`${collection}/`)) {
            docs.push(val);
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ documents: docs })
        };
      }

      return { ok: false, status: 500, text: async () => 'Server error' };
    };

    try {
      // 1. Test setDocument (PATCH)
      const testItem = { id: 'item_101', sku: 'SKU-101', name: 'Solitaire Pendant', price: 15000 };
      const saved = await CloudSync.setDocument('test_catalog', 'item_101', testItem);
      assert.equal(saved.id, 'item_101');
      assert.equal(saved.sku, 'SKU-101');

      // 2. Test getDocument (GET)
      const fetched = await CloudSync.getDocument('test_catalog', 'item_101');
      assert.ok(fetched, 'Fetched document from mock backend');
      assert.equal(fetched.id, 'item_101');
      assert.equal(fetched.name, 'Solitaire Pendant');

      // 3. Test listDocuments (GET Collection)
      await CloudSync.setDocument('test_catalog', 'item_102', { id: 'item_102', sku: 'SKU-102' });
      const list = await CloudSync.listDocuments('test_catalog');
      assert.equal(list.length, 2, 'Listed both documents from mock backend');
      assert.ok(list.some(i => i.id === 'item_101'));
      assert.ok(list.some(i => i.id === 'item_102'));

      // 4. Test 404 handling
      const missing = await CloudSync.getDocument('test_catalog', 'non_existent_id');
      assert.equal(missing, null, 'Returns null on 404 document');
    } finally {
      CloudSync._fetchWithTimeout = originalFetchWithTimeout;
    }
  });

  await t.test('4. Careful Bidirectional Merge: Zero Data Loss Verification', () => {
    const localItems = [
      { id: 'i1', sku: 'SKU-1', name: 'Local Piece 1', updatedAt: '2026-10-20T08:00:00Z' },
      { id: 'i2', sku: 'SKU-2', name: 'Local Piece 2 (Edited)', updatedAt: '2026-10-20T14:00:00Z' },
      { id: 'i3', sku: 'SKU-3', name: 'Local Piece 3 (Local Only)', updatedAt: '2026-10-20T09:00:00Z' }
    ];

    const remoteItems = [
      { id: 'i1', sku: 'SKU-1', name: 'Local Piece 1', updatedAt: '2026-10-20T08:00:00Z' },
      { id: 'i2', sku: 'SKU-2', name: 'Remote Piece 2 (Old)', updatedAt: '2026-10-20T10:00:00Z' },
      { id: 'i4', sku: 'SKU-4', name: 'Remote Piece 4 (Created by colleague)', updatedAt: '2026-10-20T11:00:00Z' }
    ];

    const { merged, itemsToUpload } = CloudSync.mergeArray(localItems, remoteItems, 'id');

    // 1. Zero records deleted: all 4 distinct items must exist in merged result
    assert.equal(merged.length, 4, 'Merged contains all items without loss');
    assert.ok(merged.some(i => i.id === 'i1'));
    assert.ok(merged.some(i => i.id === 'i2'));
    assert.ok(merged.some(i => i.id === 'i3'));
    assert.ok(merged.some(i => i.id === 'i4'));

    // 2. Conflict resolution: i2 local was updated at 14:00, remote at 10:00 -> Local wins!
    const i2 = merged.find(i => i.id === 'i2');
    assert.equal(i2.name, 'Local Piece 2 (Edited)');

    // 3. New colleague item i4 is incorporated into local inventory
    const i4 = merged.find(i => i.id === 'i4');
    assert.equal(i4.name, 'Remote Piece 4 (Created by colleague)');

    // 4. Local-only i3 and updated i2 are flagged for upload to cloud
    assert.ok(itemsToUpload.some(i => i.id === 'i3'), 'i3 queued for upload');
    assert.ok(itemsToUpload.some(i => i.id === 'i2'), 'i2 newer version queued for upload');
  });

  await t.test('5. Offline Tolerance & Error Fallback: Local Database Protected', async () => {
    const originalFetchWithTimeout = CloudSync._fetchWithTimeout;
    // Simulate complete network failure / offline
    CloudSync._fetchWithTimeout = async () => {
      throw new Error('TypeError: Failed to fetch (Network unreachable)');
    };

    const mockDatabase = {
      settings: { currency: '₹' },
      items: [{ id: 'valuable_piece', sku: 'MG-001', price: 95000 }],
      emeralds: [],
      stones: []
    };

    try {
      const result = await CloudSync.syncAll(mockDatabase);
      assert.equal(result.success, false);
      assert.equal(CloudSync.status, 'offline');
      assert.ok(CloudSync.lastError.includes('Failed to fetch'));

      // Crucial: Local database must remain 100% intact, not cleared or corrupted
      assert.equal(mockDatabase.items.length, 1);
      assert.equal(mockDatabase.items[0].id, 'valuable_piece');
      assert.equal(mockDatabase.items[0].price, 95000);
    } finally {
      CloudSync._fetchWithTimeout = originalFetchWithTimeout;
    }
  });

});

const test = require('node:test');
const assert = require('node:assert');
const CloudSync = require('../renderer/js/cloud-sync.js');

test.describe('Storage Quota & Payload Integrity Suite', () => {

  test('1. Circular reference detection protects toFirestoreValue from call stack overflows', () => {
    const cyclicObj = {
      name: 'Diamond Necklace',
      sku: 'DIA-NECK-01'
    };
    cyclicObj.self = cyclicObj; // Circular reference

    // Without cycle guard, this would throw "RangeError: Maximum call stack size exceeded"
    const firestoreVal = CloudSync.toFirestoreValue(cyclicObj);

    assert.ok(firestoreVal.mapValue);
    assert.strictEqual(firestoreVal.mapValue.fields.name.stringValue, 'Diamond Necklace');
    assert.strictEqual(firestoreVal.mapValue.fields.self.stringValue, '[Circular]');
  });

  test('2. Recursion depth limit halts arbitrarily deep nested objects', () => {
    let deepObj = { level: 0 };
    let cur = deepObj;
    for (let i = 1; i <= 50; i++) {
      cur.child = { level: i };
      cur = cur.child;
    }

    // Should convert cleanly without stack overflow and flag max depth
    const converted = CloudSync.toFirestoreValue(deepObj);
    assert.ok(converted.mapValue);

    // Drill down to depth > 32
    let node = converted;
    let depth = 0;
    while (node && node.mapValue && node.mapValue.fields.child) {
      node = node.mapValue.fields.child;
      depth++;
    }
    assert.ok(depth <= 33);
  });

  test('3. Payload bounds checking: estimateDocSize flags oversized documents', () => {
    const smallDoc = { id: 'item_1', name: 'Ring', weight: 5.5 };
    const smallSize = CloudSync.estimateDocSize(smallDoc);
    assert.ok(smallSize > 0 && smallSize < 1000);
    assert.ok(smallSize < CloudSync.MAX_DOC_SIZE_BYTES);

    // Create an artificial oversized payload (>1 MiB)
    const largeDoc = {
      id: 'item_huge',
      heavyData: 'X'.repeat(1024 * 1024 + 100) // > 1 MB
    };
    const largeSize = CloudSync.estimateDocSize(largeDoc);
    assert.ok(largeSize > CloudSync.MAX_DOC_SIZE_BYTES, 'Should correctly identify payloads exceeding 1MB limit');
  });

  test('4. Photo decoupling: base64ToUint8Array accurately prepares binary for cloud storage', () => {
    // 1x1 transparent PNG data URI
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uint8 = CloudSync.base64ToUint8Array(dataUri);

    assert.ok(uint8 instanceof Uint8Array || Buffer.isBuffer(uint8));
    assert.ok(uint8.length > 0);
    // PNG file magic header bytes: 0x89 0x50 0x4E 0x47
    assert.strictEqual(uint8[0], 0x89);
    assert.strictEqual(uint8[1], 0x50);
    assert.strictEqual(uint8[2], 0x4E);
    assert.strictEqual(uint8[3], 0x47);
  });
});

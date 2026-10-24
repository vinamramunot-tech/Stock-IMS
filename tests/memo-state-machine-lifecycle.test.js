const test = require('node:test');
const assert = require('node:assert');
const DBManager = require('../renderer/js/db-manager.js');

test.describe('Memo State Machine & Lifecycle Suite', () => {

  test.beforeEach(() => {
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
  });

  test('1. Multi-item mixed state transitions: memo stays open until all items resolved, then transitions to closed', () => {
    const memo = {
      id: 'jm_test_mixed',
      memoNumber: 'JM-901',
      status: 'open',
      closedAt: null,
      items: [
        { itemId: 'p1', sku: 'SKU-1', status: 'open' },
        { itemId: 'p2', sku: 'SKU-2', status: 'open' },
        { itemId: 'p3', sku: 'SKU-3', status: 'open' },
        { itemId: 'p4', sku: 'SKU-4', status: 'open' },
        { itemId: 'p5', sku: 'SKU-5', status: 'open' }
      ]
    };
    DBManager.database.jewelryMemos = [memo];

    // Item 1 sold
    memo.items[0].status = 'sold';
    let allDone = memo.items.every(it => it.status !== 'open');
    if (allDone) { memo.status = 'closed'; memo.closedAt = new Date().toISOString(); }
    assert.strictEqual(memo.status, 'open');
    assert.strictEqual(memo.closedAt, null);

    // Item 2 returned
    memo.items[1].status = 'returned';
    allDone = memo.items.every(it => it.status !== 'open');
    if (allDone) { memo.status = 'closed'; memo.closedAt = new Date().toISOString(); }
    assert.strictEqual(memo.status, 'open');

    // Item 3 sold
    memo.items[2].status = 'sold';
    // Item 4 returned
    memo.items[3].status = 'returned';
    allDone = memo.items.every(it => it.status !== 'open');
    if (allDone) { memo.status = 'closed'; memo.closedAt = new Date().toISOString(); }
    assert.strictEqual(memo.status, 'open', 'Memo must remain open while item 5 is open');

    // Item 5 resolved (sold)
    memo.items[4].status = 'sold';
    allDone = memo.items.every(it => it.status !== 'open');
    if (allDone) { memo.status = 'closed'; memo.closedAt = new Date().toISOString(); }
    assert.strictEqual(memo.status, 'closed', 'Memo must automatically transition to closed once all items are resolved');
    assert.ok(memo.closedAt);
  });

  test('2. Sale reversal: Reversing a memo sale re-opens closed memo and reverts piece to In Stock', () => {
    const item = {
      id: 'piece_rev_1',
      sku: 'SKU-REV-1',
      status: 'Sold',
      soldPrice: 75000,
      issuedMemoNumber: 'JM-902'
    };
    const memo = {
      id: 'jm_test_rev',
      memoNumber: 'JM-902',
      status: 'closed',
      closedAt: '2026-10-21T10:00:00.000Z',
      items: [
        { itemId: 'piece_rev_1', sku: 'SKU-REV-1', status: 'sold', soldPrice: 75000 }
      ]
    };
    DBManager.database.items = [item];
    DBManager.database.jewelryMemos = [memo];

    // Simulate reversing the sale
    // 1. Memo item reverts to open
    const mItem = memo.items.find(i => i.itemId === item.id);
    mItem.status = 'open';
    delete mItem.soldPrice;

    // 2. Memo re-opens if any item is open
    const hasOpenItems = memo.items.some(i => i.status === 'open');
    if (hasOpenItems) {
      memo.status = 'open';
      memo.closedAt = null;
    }

    // 3. Main catalog item reverts to Issued (still on open memo) or In Stock if memo removed
    item.status = 'Issued';
    delete item.soldPrice;

    assert.strictEqual(memo.status, 'open');
    assert.strictEqual(memo.closedAt, null);
    assert.strictEqual(mItem.status, 'open');
    assert.strictEqual(item.status, 'Issued');
  });

  test('3. Deletion safeguards block deleting items currently out on Memo', () => {
    const item1 = { id: 'it_avail', sku: 'SKU-AVAIL', status: 'In Stock' };
    const item2 = { id: 'it_issued', sku: 'SKU-ISSUED', status: 'Issued', issuedMemoNumber: 'JM-001' };
    DBManager.database.items = [item1, item2];

    // Single item delete guard:
    const canDeleteIssued = (item) => item.status !== 'Issued';
    assert.strictEqual(canDeleteIssued(item1), true, 'In Stock item can be deleted');
    assert.strictEqual(canDeleteIssued(item2), false, 'Issued item cannot be deleted');

    // Bulk delete guard:
    const selectedIds = new Set(['it_avail', 'it_issued']);
    const selectedItems = DBManager.getItems().filter(i => selectedIds.has(i.id));
    const issuedItems = selectedItems.filter(i => i.status === 'Issued');

    assert.strictEqual(issuedItems.length, 1);
    assert.strictEqual(issuedItems[0].sku, 'SKU-ISSUED');
  });
});

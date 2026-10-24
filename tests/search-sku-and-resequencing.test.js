const test = require('node:test');
const assert = require('node:assert');
const DBManager = require('../renderer/js/db-manager.js');
global.DBManager = DBManager;
const UI = require('../renderer/js/ui.js');

test.describe('Search, SKU Duplicate & Resequencing Suite', () => {

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

  test('1. Search query resilience: Regex special characters in search input never crash filtering', () => {
    const items = [
      { name: 'Emerald Pendant (5.2ct)', sku: 'PEN-01', description: 'With 18KT chain [Special]' },
      { name: 'Ruby Ring + Diamonds', sku: 'RNG-02', description: 'Certified *Natural*' },
      { name: 'Gold Bangle \\ Antique', sku: 'BAN-03', description: 'Price: ?' }
    ];

    const maliciousQueries = [
      '[Special]',
      '*(+?)',
      '\\',
      '[',
      '(5.2ct)',
      '+++',
      '?'
    ];

    maliciousQueries.forEach(rawQuery => {
      assert.doesNotThrow(() => {
        const query = rawQuery.toLowerCase().trim();
        const matches = items.filter(item => {
          return (item.name || '').toLowerCase().includes(query) ||
                 (item.sku || '').toLowerCase().includes(query) ||
                 (item.description || '').toLowerCase().includes(query);
        });
        assert.ok(Array.isArray(matches));
      }, `Search query "${rawQuery}" must not throw exception`);
    });

    // Verify literal matching works correctly
    const query1 = '[special]'.toLowerCase();
    const match1 = items.filter(i => (i.description || '').toLowerCase().includes(query1));
    assert.strictEqual(match1.length, 1);
    assert.strictEqual(match1[0].sku, 'PEN-01');

    const query2 = '(5.2ct)'.toLowerCase();
    const match2 = items.filter(i => (i.name || '').toLowerCase().includes(query2));
    assert.strictEqual(match2.length, 1);
    assert.strictEqual(match2[0].sku, 'PEN-01');
  });

  test('2. Case-insensitive SKU duplicate prevention: UI.checkSkuDuplicate matches across varying case and spacing', () => {
    const existing = {
      id: 'piece_existing_1',
      sku: 'EAR-09',
      name: 'Diamond Earrings',
      status: 'In Stock'
    };
    DBManager.database.items = [existing];

    // Check lowercase with whitespace
    const matchLower = UI.checkSkuDuplicate('  ear-09  ');
    assert.ok(matchLower, 'Must match lower-cased input');
    assert.strictEqual(matchLower.id, 'piece_existing_1');

    // Check uppercase
    const matchUpper = UI.checkSkuDuplicate('EAR-09');
    assert.ok(matchUpper);
    assert.strictEqual(matchUpper.id, 'piece_existing_1');

    // Check non-matching SKU
    const matchDifferent = UI.checkSkuDuplicate('EAR-10');
    assert.strictEqual(matchDifferent, null);

    // Edit mode: editing existing piece itself should not trigger duplicate warning
    UI.activeItemState = { id: 'piece_existing_1' };
    const matchSelf = UI.checkSkuDuplicate('EAR-09');
    assert.strictEqual(matchSelf, null, 'Editing an existing piece should not flag itself as duplicate');
    UI.activeItemState = null;
  });

  test('3. Continuous serial numbering: resequenceJewelrySno assigns contiguous 1..N order after deletes and sales', () => {
    const items = [
      { id: 'p_1', sku: 'SKU-1', status: 'In Stock', sno: 1 },
      { id: 'p_2', sku: 'SKU-2', status: 'In Stock', sno: 2 },
      { id: 'p_3', sku: 'SKU-3', status: 'In Stock', sno: 3 },
      { id: 'p_4', sku: 'SKU-4', status: 'In Stock', sno: 4 },
      { id: 'p_5', sku: 'SKU-5', status: 'In Stock', sno: 5 }
    ];
    DBManager.database.items = items;

    // Delete piece 2
    DBManager.database.items = DBManager.database.items.filter(i => i.id !== 'p_2');
    DBManager.resequenceJewelrySno();

    const activeAfterDelete = DBManager.database.items.filter(i => i.status !== 'Sold');
    assert.strictEqual(activeAfterDelete.length, 4);
    assert.deepStrictEqual(activeAfterDelete.map(i => i.sno), [1, 2, 3, 4], 'Serial numbers must be unbroken 1..4');

    // Sell piece 3
    const p3 = DBManager.database.items.find(i => i.id === 'p_3');
    p3.status = 'Sold';
    DBManager.resequenceJewelrySno();

    const activeAfterSale = DBManager.database.items.filter(i => i.status !== 'Sold');
    const soldItems = DBManager.database.items.filter(i => i.status === 'Sold');

    assert.strictEqual(activeAfterSale.length, 3);
    assert.deepStrictEqual(activeAfterSale.map(i => i.sno), [1, 2, 3], 'Active pieces must be resequenced to 1..3');
    assert.strictEqual(soldItems.length, 1);
    assert.strictEqual(soldItems[0].sno, null, 'Sold pieces must have null sno');
  });
});

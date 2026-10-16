const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('Jewelry Memos Sales Reconciliation & Duplicate Item Notifications', async (t) => {
  // Load source files
  const calcCode = fs.readFileSync(path.join(__dirname, '../renderer/js/calc.js'), 'utf8');
  const dbMgrCode = fs.readFileSync(path.join(__dirname, '../renderer/js/db-manager.js'), 'utf8');
  const uiCode = fs.readFileSync(path.join(__dirname, '../renderer/js/ui.js'), 'utf8');
  const catalogCode = fs.readFileSync(path.join(__dirname, '../renderer/js/catalog.js'), 'utf8');
  const memoCode = fs.readFileSync(path.join(__dirname, '../renderer/js/jewelry-memo.js'), 'utf8');

  function createEnv(dbState = {}) {
    const documentMock = {
      getElementById: (id) => {
        if (!documentMock._elements[id]) {
          documentMock._elements[id] = {
            id,
            value: '',
            dataset: {},
            style: {},
            children: [],
            replaceChildren: function(...args) { this.children = args; },
            appendChild: function(el) { this.children.push(el); },
            classList: { add: () => {}, remove: () => {} },
            addEventListener: () => {}
          };
        }
        return documentMock._elements[id];
      },
      querySelectorAll: () => [],
      createElement: (tag) => {
        const el = {
          tag,
          style: {},
          children: [],
          replaceChildren: function(...args) { this.children = args; },
          appendChild: function(c) { this.children.push(c); },
          innerHTML: '',
          textContent: '',
          addEventListener: () => {},
          querySelector: () => ({ addEventListener: () => {}, value: '0' }),
          querySelectorAll: () => []
        };
        return el;
      },
      createTextNode: (txt) => ({ text: txt }),
      _elements: {}
    };

    const ctx = {
      window: {},
      document: documentMock,
      console: console,
      setTimeout: (fn) => fn(),
      clearTimeout: () => {}
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(calcCode, ctx);
    vm.runInContext(dbMgrCode, ctx);

    ctx.DBManager.database = dbState;
    ctx.DBManager.isLoaded = true;

    vm.runInContext(uiCode, ctx);
    vm.runInContext(catalogCode, ctx);
    vm.runInContext(memoCode, ctx);

    return ctx;
  }

  await t.test('1. healJewelrySales reconciles missing sales from sold items and memos', () => {
    const mockDb = {
      settings: { goldRate24kt: { ratePerGram: 15000 } },
      items: [
        {
          id: 'item_1',
          sku: 'BRC-01',
          name: 'Diamond Bracelet',
          category: 'Bracelet',
          status: 'Sold',
          soldPrice: 300000,
          soldTo: 'Manoj Munot',
          soldBroker: 'Vinamra',
          soldDate: '2026-08-17',
          issuedMemoNumber: 'JM-001',
          createdAt: '2026-08-12T10:00:00Z',
          metals: [{ weight: 10, karat: 18, wastage: 15 }]
        },
        {
          id: 'item_2',
          sku: 'EAR-09',
          name: 'Emerald Earrings',
          category: 'Earrings',
          status: 'Sold',
          soldPrice: 325000,
          soldTo: 'Manoj Munot',
          soldBroker: 'Vinamra',
          soldDate: '2026-08-17',
          issuedMemoNumber: 'JM-001',
          createdAt: '2026-08-12T10:00:00Z',
          metals: [{ weight: 8, karat: 18, wastage: 15 }]
        },
        {
          id: 'item_3',
          sku: 'RNG-01',
          name: 'Active Ring',
          category: 'Ring',
          status: 'In Stock',
          metals: [{ weight: 5, karat: 18, wastage: 15 }]
        }
      ],
      jewelryMemos: [
        {
          id: 'memo_1',
          memoNumber: 'JM-001',
          personName: 'Manoj Munot',
          brokerName: 'Vinamra',
          status: 'closed',
          date: '2026-08-12',
          items: [
            { itemId: 'item_1', sku: 'BRC-01', name: 'Diamond Bracelet', status: 'sold', soldPrice: 300000 },
            { itemId: 'item_2', sku: 'EAR-09', name: 'Emerald Earrings', status: 'sold', soldPrice: undefined }
          ]
        }
      ],
      jewelrySales: []
    };

    const env = createEnv(mockDb);
    env.DBManager.healVaultData(mockDb);

    // Sales array should now be populated with both sold items
    assert.strictEqual(mockDb.jewelrySales.length, 2, 'Should heal and populate 2 missing sales');
    assert.strictEqual(mockDb.jewelrySales[0].saleNumber, 'JS-0001');
    assert.strictEqual(mockDb.jewelrySales[1].saleNumber, 'JS-0002');
    assert.strictEqual(mockDb.jewelrySales[0].sku, 'BRC-01');
    assert.strictEqual(mockDb.jewelrySales[0].customerName, 'Manoj Munot');
    assert.strictEqual(mockDb.jewelrySales[0].memoNumber, 'JM-001');
    assert.strictEqual(mockDb.jewelrySales[0].memoId, 'memo_1');

    // Memo item #2 should also have its missing soldPrice healed
    assert.strictEqual(mockDb.jewelryMemos[0].items[1].soldPrice, 325000, 'Memo item soldPrice should be healed from item soldPrice');
  });

  await t.test('2. checkSkuDuplicate detects Sold, Issued, and In Stock items accurately', () => {
    const mockDb = {
      items: [
        { id: 'i1', sku: 'EAR-09', name: 'Yellow Cushion Earrings', status: 'Sold', soldTo: 'Manoj Munot', soldDate: '2026-08-17', soldPrice: 325000, issuedMemoNumber: 'JM-001' },
        { id: 'i2', sku: 'EAR-23', name: 'Kunzite Earring', status: 'Issued', issuedTo: 'Bangalore', issuedMemoNumber: 'JM-004' },
        { id: 'i3', sku: 'RNG-05', name: 'Ruby Solitaire', status: 'In Stock' }
      ]
    };

    const env = createEnv(mockDb);

    // Sold item check
    const matchSold = env.UI.checkSkuDuplicate('ear-09');
    assert.ok(matchSold, 'Should find sold item');
    assert.strictEqual(matchSold.status, 'Sold');
    assert.strictEqual(matchSold.soldTo, 'Manoj Munot');

    // Out on Memo item check
    const matchMemo = env.UI.checkSkuDuplicate('EAR-23');
    assert.ok(matchMemo, 'Should find issued item');
    assert.strictEqual(matchMemo.status, 'Issued');
    assert.strictEqual(matchMemo.issuedMemoNumber, 'JM-004');

    // In Stock item check
    const matchStock = env.UI.checkSkuDuplicate('RNG-05');
    assert.ok(matchStock, 'Should find in-stock item');
    assert.strictEqual(matchStock.status, 'In Stock');

    // Self-edit check (should not flag duplicate on same item id)
    env.UI.activeItemState = { id: 'i3' };
    const matchSelf = env.UI.checkSkuDuplicate('RNG-05');
    assert.strictEqual(matchSelf, null, 'Self-edit must not flag as duplicate');
  });

  await t.test('3. Excel import detectDuplicates tags exact Sold and Memo status', () => {
    const mockDb = {
      items: [
        { id: 'i1', sku: 'EAR-09', name: 'Yellow Cushion Earrings', status: 'Sold', soldTo: 'Manoj Munot', soldDate: '2026-08-17', soldPrice: 325000, metals: [{ weight: 5, karat: 18 }] },
        { id: 'i2', sku: 'EAR-23', name: 'Kunzite Earring', status: 'Issued', issuedTo: 'Bangalore', issuedMemoNumber: 'JM-004', metals: [{ weight: 4, karat: 18 }] }
      ]
    };

    const env = createEnv(mockDb);

    const parsedItems = [
      { tempId: 't1', sku: 'EAR-09', name: 'Yellow Cushion Earrings', metals: [{ weight: 5, karat: 18 }] },
      { tempId: 't2', sku: 'EAR-23', name: 'Kunzite Earring', metals: [{ weight: 4, karat: 18 }] },
      { tempId: 't3', sku: 'NEW-01', name: 'Brand New Piece', metals: [{ weight: 6, karat: 18 }] }
    ];

    env.Catalog.detectDuplicates(parsedItems);

    assert.strictEqual(parsedItems[0].isDuplicate, true);
    assert.strictEqual(parsedItems[0].duplicateStatus, 'Sold');
    assert.ok(parsedItems[0].duplicateReason.includes('Already SOLD'));

    assert.strictEqual(parsedItems[1].isDuplicate, true);
    assert.strictEqual(parsedItems[1].duplicateStatus, 'Issued');
    assert.ok(parsedItems[1].duplicateReason.includes('OUT ON MEMO'));

    assert.strictEqual(parsedItems[2].isDuplicate, false);
  });

  await t.test('4. Memo handleAddItemToSelected prevents adding Sold or Out-on-Memo pieces', () => {
    const mockDb = {
      items: [
        { id: 'i_sold', sku: 'EAR-09', name: 'Sold Piece', status: 'Sold', soldTo: 'Client A', soldDate: '2026-08-17' },
        { id: 'i_memo', sku: 'EAR-23', name: 'Out Piece', status: 'Issued', issuedTo: 'Client B', issuedMemoNumber: 'JM-004' },
        { id: 'i_stock', sku: 'STK-01', name: 'Available Piece', status: 'In Stock', metals: [{ weight: 5, karat: 18 }] }
      ],
      settings: { goldRate24kt: { ratePerGram: 15000 } }
    };

    const env = createEnv(mockDb);
    let lastToast = null;
    env.UI.showToast = (msg, isErr) => { lastToast = { msg, isErr }; };

    const selectEl = env.document.getElementById('jewelry-memo-create-select');

    // Attempt to add sold item
    selectEl.value = 'i_sold';
    env.JewelryMemoController.selectedItems = [];
    env.JewelryMemoController.handleAddItemToSelected();
    assert.strictEqual(env.JewelryMemoController.selectedItems.length, 0, 'Must not add sold item');
    assert.ok(lastToast && lastToast.msg.includes('already SOLD'), 'Toast must mention item was already sold');

    // Attempt to add item issued to another memo
    selectEl.value = 'i_memo';
    env.JewelryMemoController.editingMemoId = null;
    env.JewelryMemoController.handleAddItemToSelected();
    assert.strictEqual(env.JewelryMemoController.selectedItems.length, 0, 'Must not add item out on another memo');
    assert.ok(lastToast && lastToast.msg.includes('OUT ON MEMO'), 'Toast must mention item is out on memo');

    // Add valid in-stock item
    selectEl.value = 'i_stock';
    env.JewelryMemoController.handleAddItemToSelected();
    assert.strictEqual(env.JewelryMemoController.selectedItems.length, 1, 'In-stock item should be added successfully');
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const catalogJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/catalog.js'), 'utf8');
const calcJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/calc.js'), 'utf8');
const emeraldJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/emerald.js'), 'utf8');
const stoneJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/stone.js'), 'utf8');

// Set up sandbox with mocks
const sandbox = {
  document: {
    getElementById: () => ({
      value: '',
      addEventListener: () => {},
      options: [],
      classList: { add: () => {}, remove: () => {} }
    }),
    querySelectorAll: () => []
  },
  window: {},
  DBManager: {
    getSettings: () => ({ goldRate24kt: { ratePerGram: 7200 } }),
    getItems: () => [],
    getEmeralds: () => [],
    getStones: () => []
  },
  UI: {
    escapeHtml: (s) => s
  }
};

vm.createContext(sandbox);
vm.runInContext(calcJs + '\nglobalThis.Calc = Calc;', sandbox);
vm.runInContext(catalogJs + '\nglobalThis.Catalog = Catalog;', sandbox);
vm.runInContext(emeraldJs + '\nglobalThis.Emerald = EmeraldController;', sandbox);
vm.runInContext(stoneJs + '\nglobalThis.Stone = StoneController;', sandbox);

const { Calc, Catalog, Emerald, Stone } = sandbox;

test('Comprehensive Data Mismatch & Cross-Model Resilience Audit', async (suite) => {

  await suite.test('1. Category Plural/Singular & Casing Normalization', () => {
    // Normalization to standard categories
    assert.equal(Catalog.normalizeCategory('Rings'), 'Ring');
    assert.equal(Catalog.normalizeCategory('rings'), 'Ring');
    assert.equal(Catalog.normalizeCategory('Ring'), 'Ring');
    assert.equal(Catalog.normalizeCategory('Earring'), 'Earrings');
    assert.equal(Catalog.normalizeCategory('earrings'), 'Earrings');
    assert.equal(Catalog.normalizeCategory('Necklaces'), 'Necklace');
    assert.equal(Catalog.normalizeCategory('Bracelets'), 'Bracelet');
    assert.equal(Catalog.normalizeCategory('Bangles'), 'Bracelet');
    assert.equal(Catalog.normalizeCategory('Pendants'), 'Pendant');
    assert.equal(Catalog.normalizeCategory('Custom Choker'), 'Custom Choker');

    // Matching handles singular vs plural queries seamlessly
    assert.ok(Catalog.itemMatchesCategory('Rings', 'Ring'), 'Item with category Rings must match filter Ring');
    assert.ok(Catalog.itemMatchesCategory('Ring', 'Rings'), 'Item with category Ring must match filter Rings');
    assert.ok(Catalog.itemMatchesCategory('Necklaces', 'Necklace'), 'Necklaces matches Necklace');
    assert.ok(Catalog.itemMatchesCategory('Earring', 'Earrings'), 'Earring matches Earrings');
    assert.ok(Catalog.itemMatchesCategory('Pendants', 'Pendant'), 'Pendants matches Pendant');
    assert.ok(Catalog.itemMatchesCategory('Ring', ''), 'Empty filter matches all');
    assert.ok(!Catalog.itemMatchesCategory('Ring', 'Earrings'), 'Non-matching category rejected');
  });

  await suite.test('2. Status Normalization & Case Insensitivity', () => {
    // Normalized status mappings
    assert.equal(Catalog.normalizeItemStatus('sold'), 'Sold');
    assert.equal(Catalog.normalizeItemStatus('Sold'), 'Sold');
    assert.equal(Catalog.normalizeItemStatus('SOLD'), 'Sold');
    assert.equal(Catalog.normalizeItemStatus('issued'), 'Issued');
    assert.equal(Catalog.normalizeItemStatus('on memo'), 'Issued');
    assert.equal(Catalog.normalizeItemStatus('On Memo'), 'Issued');
    assert.equal(Catalog.normalizeItemStatus('in stock'), 'In Stock');
    assert.equal(Catalog.normalizeItemStatus('in-stock'), 'In Stock');
    assert.equal(Catalog.normalizeItemStatus('available'), 'In Stock');
    assert.equal(Catalog.normalizeItemStatus(undefined), 'In Stock');
    assert.equal(Catalog.normalizeItemStatus(null), 'In Stock');
    assert.equal(Catalog.normalizeItemStatus(''), 'In Stock');
  });

  await suite.test('3. Root vs Nested Gross Weight & Karat Fallbacks', () => {
    // Item with only grossWt and metals[0].karat (e.g. from Excel imports or older records)
    const legacyItem = {
      name: 'Emerald Ring',
      grossWt: 12.5,
      metals: [{ name: 'Body Component', karat: 14.5, weight: 12.5, wastage: 12 }]
    };

    const netMetals = Calc.getNetMetals(legacyItem);
    assert.equal(netMetals.length, 1, 'Single Body Component should be promoted to Main Piece without double counting');
    assert.equal(netMetals[0].grossWeight, 12.5);
    assert.equal(netMetals[0].karat, 14.5);
    assert.equal(netMetals[0].wastage, 12);

    // Item using 'weight' instead of 'grossWeight'
    const altItem = {
      name: 'Gold Pendant',
      weight: 6.2,
      karat: 22
    };
    const altNetMetals = Calc.getNetMetals(altItem);
    assert.equal(altNetMetals.length, 1);
    assert.equal(altNetMetals[0].grossWeight, 6.2);
    assert.equal(altNetMetals[0].karat, 22);
  });

  await suite.test('4. Stone Weight Property Fallbacks (weight, carats, cts, totalWeight)', () => {
    // Stone using 'weight'
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ weight: 5.0 }] }), 1.0); // 5 ct * 0.2 = 1.0 g

    // Stone using 'carats'
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ carats: 5.0 }] }), 1.0);

    // Stone using 'cts'
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ cts: 5.0 }] }), 1.0);

    // Stone using 'totalWeight'
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ totalWeight: 5.0 }] }), 1.0);

    // Diamond using 'carats'
    assert.equal(Calc.getStoneWeightInGrams({ diamondsPolki: [{ carats: 10.0 }] }), 2.0); // 10 ct * 0.2 = 2.0 g
  });

  await suite.test('5. Emerald Origins Extraction (array, string, singular origin)', () => {
    // Array of origins
    assert.equal(
      JSON.stringify(Emerald.getEmeraldOrigins({ origins: ['Zambian', 'Colombian'] })),
      JSON.stringify(['Zambian', 'Colombian'])
    );

    // Singular string 'origin'
    assert.equal(
      JSON.stringify(Emerald.getEmeraldOrigins({ origin: 'Zambian' })),
      JSON.stringify(['Zambian'])
    );

    // Comma-separated string 'origins'
    assert.equal(
      JSON.stringify(Emerald.getEmeraldOrigins({ origins: 'Zambian, Panjshir' })),
      JSON.stringify(['Zambian', 'Panjshir'])
    );

    // Empty / missing
    assert.equal(JSON.stringify(Emerald.getEmeraldOrigins({})), JSON.stringify([]));
  });

  await suite.test('6. Emerald Shapes Extraction (shapes array, shapes string, shape, sizes)', () => {
    // Array of shapes
    assert.equal(
      JSON.stringify(Emerald.getEmeraldShapes({ shapes: ['Octagon', 'Round'] })),
      JSON.stringify(['Octagon', 'Round'])
    );

    // Comma-separated string
    assert.equal(
      JSON.stringify(Emerald.getEmeraldShapes({ shapes: 'Octagon, Pear' })),
      JSON.stringify(['Octagon', 'Pear'])
    );

    // Singular shape
    assert.equal(
      JSON.stringify(Emerald.getEmeraldShapes({ shape: 'Octagon' })),
      JSON.stringify(['Octagon'])
    );

    // Sizes array
    assert.equal(
      JSON.stringify(Emerald.getEmeraldShapes({ sizes: [{ shape: 'Octagon', mm: '5x3' }, { shape: 'Oval', mm: '6x4' }] })),
      JSON.stringify(['Octagon', 'Oval'])
    );
  });

  await suite.test('7. Loose Stone Grade / Clarity & Pieces Property Fallbacks', () => {
    // lustreGrade
    assert.equal(Stone.getStoneGrade({ lustreGrade: 'VVS' }), 'VVS');

    // grade
    assert.equal(Stone.getStoneGrade({ grade: 'VS1' }), 'VS1');

    // clarity
    assert.equal(Stone.getStoneGrade({ clarity: 'SI' }), 'SI');

    // Pieces property fallbacks
    assert.equal(Stone.getStonePieces({ pieces: 12 }), 12);
    assert.equal(Stone.getStonePieces({ quantity: 8 }), 8);
    assert.equal(Stone.getStonePieces({ count: 15 }), 15);
  });
});

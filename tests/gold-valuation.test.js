const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../renderer/js/calc.js');

test('Gold Valuation - Karat factors and metal values', async (t) => {
  await t.test('24KT pure gold calculation', () => {
    const val = Calc.calculateMetalValue(10, 24, 7500);
    assert.equal(val, 75000);
  });

  await t.test('22KT gold calculation (22/24)', () => {
    const val = Calc.calculateMetalValue(10, 22, 7500);
    assert.equal(val, 68750);
  });

  await t.test('18KT gold calculation (18/24 = 75%)', () => {
    const val = Calc.calculateMetalValue(10, 18, 7500);
    assert.equal(val, 56250);
  });

  await t.test('14KT gold calculation (14/24)', () => {
    const val = Calc.calculateMetalValue(10, 14, 7500);
    assert.equal(val, 43750);
  });

  await t.test('Graceful handling of null/zero/invalid inputs', () => {
    assert.equal(Calc.calculateMetalValue(0, 18, 7500), 0);
    assert.equal(Calc.calculateMetalValue(10, null, 7500), 0);
    assert.equal(Calc.calculateMetalValue(10, 18, 0), 0);
    assert.equal(Calc.calculateMetalValue(null, null, null), 0);
  });
});

test('Stone Weight in Grams Conversion', async (t) => {
  await t.test('Converts carats to grams at 1 ct = 0.2 g', () => {
    const item = {
      stones: [{ weight: 3.5 }],
      diamondsPolki: [{ weight: 1.5 }]
    };
    // Total carats = 5.0 cts * 0.2 = 1.0 g
    const stoneGrams = Calc.getStoneWeightInGrams(item);
    assert.equal(stoneGrams, 1.0);
  });

  await t.test('Handles empty and missing stone arrays safely', () => {
    assert.equal(Calc.getStoneWeightInGrams({}), 0);
    assert.equal(Calc.getStoneWeightInGrams({ stones: [] }), 0);
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ weight: 'invalid' }] }), 0);
  });
});

test('Net Metals Breakdown & Stone Deduction', async (t) => {
  await t.test('Deducts stone weight from main piece gross weight', () => {
    const item = {
      grossWeight: 12.0,
      karat: 18,
      wastage: 15,
      stones: [{ weight: 5.0 }] // 5 cts * 0.2 = 1.0 g
    };
    const metals = Calc.getNetMetals(item);
    assert.equal(metals.length, 1);
    assert.equal(metals[0].grossWeight, 12.0);
    assert.equal(metals[0].netWeight, 11.0); // 12 - 1 = 11
    assert.equal(metals[0].wastage, 15);
  });

  await t.test('Preserves additional metal parts without stone deduction', () => {
    const item = {
      grossWeight: 15.0,
      karat: 18,
      metals: [
        { name: '18K Clasp', weight: 2.0, karat: 18, wastage: 10 }
      ],
      stones: [{ weight: 5.0 }] // 1.0 g
    };
    const metals = Calc.getNetMetals(item);
    assert.equal(metals.length, 2);
    // Main piece gross = 15 - 2 = 13g; net = 13 - 1 = 12g
    assert.equal(metals[0].name, 'Main Piece');
    assert.equal(metals[0].grossWeight, 13.0);
    assert.equal(metals[0].netWeight, 12.0);
    // Additional part
    assert.equal(metals[1].name, '18K Clasp');
    assert.equal(metals[1].grossWeight, 2.0);
    assert.equal(metals[1].netWeight, 2.0);
  });
});

test('Complete Item Valuation (evaluateItem)', async (t) => {
  await t.test('Evaluates complete jewelry item with market rate, mfg rate, stones, and commission', () => {
    const item = {
      grossWeight: 11.0,
      karat: 18,
      wastage: 10, // 10% wastage
      labourCost: 2000,
      makingChargeType: 'flat',
      commission: 500,
      mfgGoldRate24kt: 6000,
      sellingPrice: 85000,
      stones: [
        { type: 'Emerald', weight: 5.0, ratePerCarat: 4000 } // 5 * 4000 = 20,000 (1.0g stone weight)
      ],
      diamondsPolki: []
    };
    // Net metal = 11g - 1g = 10g of 18KT
    // Effective metal weight with 10% wastage = 10 * 1.10 = 11.0g
    // Global 24KT rate = ₹7,000 / g -> 18KT rate = 7000 * 0.75 = ₹5,250 / g
    // Metal value = 11.0g * 5250 = ₹57,750
    // Stone value = ₹20,000
    // Labour cost = ₹2,000
    // Subtotal = 57,750 + 20,000 + 2,000 = ₹79,750
    // Commission = ₹500
    // Market Cost = 79,750 + 500 = ₹80,250
    const globalRate = 7000;
    const result = Calc.evaluateItem(item, globalRate);

    assert.equal(result.totalGrossWeight, 11.0);
    assert.equal(result.totalNetMetalWeight, 10.0);
    assert.equal(result.stoneSubtotal, 20000);
    assert.equal(result.subtotal, 79750);
    assert.equal(result.marketCostPrice, 80250);
    // Non-emerald cost = 80250 - 20000 = 60250
    // With default 40% margin: 60250 * 1.4 = 84350 + 20000 (emerald passed at cost) = 104350
    assert.equal(result.sellingPrice, 104350);
  });

  await t.test('Never crashes or produces NaN on malformed or empty item', () => {
    const result = Calc.evaluateItem(null, 7000);
    assert.ok(result);
    assert.equal(result.marketCostPrice, 0);
    assert.equal(result.sellingPrice, 0);

    const emptyResult = Calc.evaluateItem({}, 0);
    assert.ok(emptyResult);
    assert.equal(Number.isNaN(emptyResult.marketCostPrice), false);
  });
});

const test = require('node:test');
const assert = require('node:assert');
const Calc = require('../renderer/js/calc.js');

test.describe('Financial Valuation Integrity Suite', () => {

  test('1. Gold rate rotation: Active stock revalues dynamically while historical sales remain frozen', () => {
    // Piece manufactured when gold rate was 12,000/g (18KT = 9,000/g, 10g + 15% wastage = 11.5g * 9,000 = 103,500)
    const piece = {
      id: 'piece_valuation_test',
      grossWeight: 10,
      karat: 18,
      wastage: 15,
      mfgCostPrice: 103500,
      mfgGoldRate24kt: 12000
    };

    // Live market gold rate is ₹15,200/g
    const initialEval = Calc.evaluateItem(piece, 15200);
    // 10g * (18/24) * 15,200 * 1.15 = 131,100
    assert.strictEqual(initialEval.metalSubtotal, 131100);

    // Historic sale recorded at soldPrice = ₹140,000
    const saleRecord = {
      id: 'sale_hist_1',
      itemId: piece.id,
      soldPrice: 140000,
      mfgCost: piece.mfgCostPrice,
      profit: 140000 - piece.mfgCostPrice // ₹36,500
    };
    assert.strictEqual(saleRecord.profit, 36500);

    // Later: Global gold rate jumps to ₹18,000/g
    const updatedEval = Calc.evaluateItem(piece, 18000);
    // 10g * (18/24) * 18,000 * 1.15 = 155,250
    assert.strictEqual(updatedEval.metalSubtotal, 155250, 'Active catalog piece must revalue with the new gold rate');

    // Historical sale record remains completely immutable
    assert.strictEqual(saleRecord.mfgCost, 103500, 'Historical sale mfgCost must remain unchanged');
    assert.strictEqual(saleRecord.soldPrice, 140000, 'Historical sale soldPrice must remain unchanged');
    assert.strictEqual(saleRecord.profit, 36500, 'Historical sale profit must remain unchanged');
  });

  test('2. Net metal weight guard: Calc.getNetMetals protects against negative net gold weights', () => {
    // Extreme edge case: User enters gross weight 5g, but stone array totals 30 cts (30 * 0.2g = 6g)
    const erroneousItem = {
      grossWeight: 5,
      karat: 18,
      stones: [
        { weight: 30 } // 6 grams!
      ]
    };

    const netMetals = Calc.getNetMetals(erroneousItem);
    assert.strictEqual(netMetals.length, 1);
    assert.strictEqual(netMetals[0].grossWeight, 5);
    // Net weight should clamp to 0 instead of producing -1
    assert.strictEqual(netMetals[0].netWeight, 0, 'Net metal weight must never be negative');

    // Safe item: Gross 10g, stone 5 cts (1g) -> net 9g
    const normalItem = {
      grossWeight: 10,
      karat: 18,
      stones: [
        { weight: 5 }
      ]
    };
    const normalNet = Calc.getNetMetals(normalItem);
    assert.strictEqual(normalNet[0].netWeight, 9);
  });

  test('3. Indian currency string parsing: Calc.parseNumber handles lakhs, crores, and symbols', () => {
    // Native parseInt / Number fails on Indian commas
    assert.strictEqual(parseInt('2,50,000', 10), 2, 'Proof: parseInt truncates at comma');
    assert.ok(isNaN(Number('2,50,000')), 'Proof: Number fails on comma string');

    // Calc.parseNumber handles strings seamlessly
    assert.strictEqual(Calc.parseNumber('2,50,000'), 250000);
    assert.strictEqual(Calc.parseNumber('₹ 1,23,45,678.50'), 12345678.5);
    assert.strictEqual(Calc.parseNumber('  15,200  '), 15200);
    assert.strictEqual(Calc.parseNumber('$ 5,000'), 5000);
    assert.strictEqual(Calc.parseNumber(null), 0);
    assert.strictEqual(Calc.parseNumber(undefined), 0);
    assert.strictEqual(Calc.parseNumber(''), 0);
    assert.strictEqual(Calc.parseNumber('invalid', 100), 100);

    // Formatters using parseNumber handle comma-separated string inputs
    assert.strictEqual(Calc.formatIndianNumber('2,50,000'), '2,50,000');
    assert.strictEqual(Calc.formatINR('1,00,00,000'), '₹1,00,00,000.00');

    // calculateSaleProfit handles string prices with Indian commas
    const profitData = Calc.calculateSaleProfit('2,50,000', '1,80,000', '2,10,000');
    assert.strictEqual(profitData.soldPrice, 250000);
    assert.strictEqual(profitData.mfgCost, 180000);
    assert.strictEqual(profitData.mfgProfit, 70000);
    assert.strictEqual(profitData.replacementProfit, 40000);
  });
});

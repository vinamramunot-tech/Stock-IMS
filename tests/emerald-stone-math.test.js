const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../renderer/js/calc.js');

test('Emerald & Stone Mathematics - Pure Engine Tests', async (t) => {
  await t.test('Carat to Gram conversions (1 ct = 0.2 g)', () => {
    // 5 ct of stones + 2.5 ct of diamonds = 7.5 ct * 0.2 = 1.5 g
    const item = {
      stones: [{ weight: 5.0 }],
      diamondsPolki: [{ weight: 2.5 }]
    };
    assert.equal(Calc.getStoneWeightInGrams(item), 1.5);

    // Micro weights
    assert.equal(Calc.getStoneWeightInGrams({ stones: [{ weight: 0.05 }] }), 0.01);
  });

  await t.test('Bidirectional stone total and rate calculations', () => {
    // 4.25 carats at ₹12,000/ct = ₹51,000
    assert.equal(Calc.calculateStoneTotal(4.25, 12000), 51000);

    // Deriving rate: ₹51,000 / 4.25 carats = ₹12,000/ct
    assert.equal(Calc.calculateStoneRate(4.25, 51000), 12000);

    // Non-round float precision
    assert.equal(Calc.calculateStoneTotal(1.33, 4999), 6648.67);
  });

  await t.test('Multiplier discount mathematics (e.g. 0.9x, 0.8x, custom)', () => {
    const baseRate = 25000;

    // 0.9x (10% off)
    assert.equal(Calc.calculateDiscountedRate(baseRate, 0.9), 22500);

    // 0.8x (20% off)
    assert.equal(Calc.calculateDiscountedRate(baseRate, 0.8), 20000);

    // Custom 0.85x
    assert.equal(Calc.calculateDiscountedRate(baseRate, 0.85), 21250);

    // Multiplier omitted or 1.0
    assert.equal(Calc.calculateDiscountedRate(baseRate, 1.0), 25000);
    assert.equal(Calc.calculateDiscountedRate(baseRate, null), 25000);
    assert.equal(Calc.calculateDiscountedRate(baseRate, 'invalid'), 25000);
  });

  await t.test('Currency conversion (USD / INR)', () => {
    const exchangeRate = 86.50;

    // $1,250 USD to INR
    const inr = Calc.convertCurrency(1250, exchangeRate);
    assert.equal(inr, 108125.00);

    // INR back to USD
    const usd = Calc.convertCurrency(inr, 1 / exchangeRate);
    assert.equal(usd, 1250.00);

    // Invalid inputs safely return 0
    assert.equal(Calc.convertCurrency(null, exchangeRate), 0);
    assert.equal(Calc.convertCurrency(100, 0), 0);
  });

  await t.test('Emerald-specific Home Cost Price discount logic (50% default)', () => {
    const item = {
      grossWeight: 10.0,
      karat: 18,
      wastage: 0,
      stones: [
        { type: 'Emerald', weight: 5.0, ratePerCarat: 10000 } // Total Emerald value = 50,000 (1.0g metal deduction)
      ]
    };
    // 9g net metal @ 18K (75% of 6000) = 9 * 4500 = 40,500
    // Emerald = 50,000
    // Market Cost = 40,500 + 50,000 = 90,500
    // Home Cost Price with default 50% discount on emerald = 90,500 - (50,000 * 0.5) = 65,500
    const res = Calc.evaluateItem(item, 6000);
    assert.equal(res.hasEmerald, true);
    assert.equal(res.emeraldTotal, 50000);
    assert.equal(res.marketCostPrice, 90500);
    assert.equal(res.homeCostPrice, 65500);
  });

  await t.test('Emerald selling price passes emerald at cost while marking up metal/labor/other stones', () => {
    const itemWithEmerald = {
      grossWeight: 10.0,
      karat: 18,
      wastage: 0,
      profitPercentage: 30, // 30% margin
      stones: [
        { type: 'Emerald', weight: 5.0, ratePerCarat: 10000 } // ₹50,000 emerald
      ]
    };
    // Metal subtotal = 9g * 4500 = 40,500
    // Emerald subtotal = 50,000
    // Market Cost = 90,500
    // Selling price = (40,500 * 1.30) + 50,000 = 52,650 + 50,000 = 102,650
    const resEmerald = Calc.evaluateItem(itemWithEmerald, 6000);
    assert.equal(resEmerald.sellingPrice, 102650);

    const itemWithRuby = {
      grossWeight: 10.0,
      karat: 18,
      wastage: 0,
      profitPercentage: 30, // 30% margin
      stones: [
        { type: 'Ruby', weight: 5.0, ratePerCarat: 10000 } // ₹50,000 ruby
      ]
    };
    // For non-emerald stones, profit margin applies to entire piece: 90,500 * 1.30 = 117,650
    const resRuby = Calc.evaluateItem(itemWithRuby, 6000);
    assert.equal(resRuby.hasEmerald, false);
    assert.equal(resRuby.sellingPrice, 117650);
  });
});
